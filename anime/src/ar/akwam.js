const mangayomiSources = [{
    "name": "أكوام",
    "id": 872036737,
    "lang": "ar",
    "baseUrl": "https://ak.sv",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=ak.sv",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.6",
    "pkgPath": "anime/src/ar/akwam.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    // FIXED: Use overrideable Base URL from preferences.
    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders(referer) {
        return {
            "Referer": referer || this.getBaseUrl()
        };
    }

    async requestDoc(path, referer) {
        const url = this.getBaseUrl() + path;
        const res = await this.client.get(url, this.getHeaders(referer));
        return new Document(res.body);
    }
    
    async requestFullUrlDoc(url, referer) {
        const res = await this.client.get(url, this.getHeaders(referer));
        return new Document(res.body);
    }

    parseAnimeFromElement(element) {
        const imageElement = element.selectFirst("picture img");
        return {
            name: imageElement.attr("alt"),
            imageUrl: imageElement.attr("data-src"),
            link: element.attr("href").replace(this.getBaseUrl(), '')
        };
    }

    async getPopular(page) {
        const doc = await this.requestDoc(`/movies?page=${page}`);
        const list = [];
        const items = doc.select("div.entry-box-1 div.entry-image a.box");

        for (const item of items) {
            list.push(this.parseAnimeFromElement(item));
        }

        const hasNextPage = !!doc.selectFirst("ul.pagination li.page-item a[rel=next]");
        return { list, hasNextPage };
    }

    async getLatestUpdates(page) {
        throw new Error("Not supported");
    }

    async search(query, page, filters) {
        function getSelectValue(filter) {
            if (!filter || typeof filter.state !== 'number') return null;
            return filter.values[filter.state]?.value;
        }

        const params = [];
        params.push(`page=${page}`);
        let basePath;

        if (query) {
            basePath = '/search';
            params.push(`q=${encodeURIComponent(query)}`);
            const section = getSelectValue(filters[2]);
            const rating = getSelectValue(filters[3]);
            const format = getSelectValue(filters[4]);
            const quality = getSelectValue(filters[5]);

            if (section && section !== '0') params.push(`section=${section}`);
            if (rating && rating !== '0') params.push(`rating=${rating}`);
            if (format && format !== '0') params.push(`formats=${format}`);
            if (quality && quality !== '0') params.push(`quality=${quality}`);
        } else {
            const type = getSelectValue(filters[8]) || 'movies';
            basePath = `/${type}`;
            const sectionS = getSelectValue(filters[9]);
            const categoryS = getSelectValue(filters[10]);
            const ratingS = getSelectValue(filters[11]);
            
            if (sectionS && sectionS !== '0') params.push(`section=${sectionS}`);
            if (categoryS && categoryS !== '0') params.push(`category=${categoryS}`);
            if (ratingS && ratingS !== '0') params.push(`rating=${ratingS}`);
        }
        
        const finalPath = `${basePath}?${params.join('&')}`;
        const doc = await this.requestDoc(finalPath);
        const list = [];
        const items = doc.select("div.widget div.widget-body div.col-lg-auto div.entry-box div.entry-image a.box");

        for (const item of items) {
            list.push(this.parseAnimeFromElement(item));
        }

        const hasNextPage = !!doc.selectFirst("ul.pagination li.page-item a[rel=next]");
        return { list, hasNextPage };
    }
    
    async getDetail(url) {
        const doc = await this.requestDoc(url);

        const name = doc.selectFirst("picture > img.img-fluid").attr("alt");
        const genres = doc.select("div.font-size-16.d-flex.align-items-center.mt-3 a.badge, span.badge-info, span:contains(جودة الفيلم), span:contains(انتاج)")
                          .map(e => e.text.replace("جودة الفيلم : ", "").trim());
        const author = doc.selectFirst("span:contains(انتاج)")?.text.replace("انتاج : ", "").trim() ?? '';
        const description = doc.selectFirst("div.widget:contains(قصة )")?.text.trim() ?? '';
        const status = 1;

        const chapters = [];
        const episodeElements = doc.select("div.bg-primary2 h2 a");
        if (episodeElements.length === 0) {
            chapters.push({
                name: "مشاهدة",
                url: url
            });
        } else {
            episodeElements.forEach(element => {
                const originalName = element.text;
                let finalName = originalName;

                const match = originalName.match(/حلقة\s*(\d+)/);
                if (match && match[1]) {
                    finalName = `الحلقة : ${match[1]}`;
                }

                chapters.push({
                    name: finalName,
                    url: element.getHref.replace(this.getBaseUrl(), '')
                });
            });
        }
        
        return { author, description, status, link: url, chapters };
    }
    
    async getVideoList(url) {
        const videos = [];
        const initialDoc = await this.requestDoc(url);
        const referer = this.getBaseUrl() + url;
        const sourceTypePref = this.getPreference("video_source_type") ?? "both";

        const downloadWidget = initialDoc.selectFirst("div.widget:has(header#downloads)");
        if (!downloadWidget) {
            throw new Error("Could not find the download/streaming widget.");
        }

        const qualityTabs = downloadWidget.select("div.header-tabs-container > ul.header-tabs > li > a");

        for (const tabLink of qualityTabs) {
            const qualityName = tabLink.text;
            const tabId = tabLink.attr("href");
            const tabContent = downloadWidget.selectFirst(`div${tabId}`);

            if (!tabContent) continue;

            const processLink = async (linkElement, type) => {
                if (!linkElement) return;

                const intermediateUrl1 = linkElement.getHref;
                const intermediateDoc1 = await this.requestFullUrlDoc(intermediateUrl1, referer);
                
                const intermediateUrl2 = intermediateDoc1.selectFirst("a.download-link")?.getHref;
                if (!intermediateUrl2) return;

                const finalDoc = await this.requestFullUrlDoc(intermediateUrl2, intermediateUrl1);

                if (type === 'Stream') {
                    finalDoc.select("video source").forEach(source => {
                        const src = source.attr("src");
                        const quality = source.attr("size");
                        if (src && quality) {
                            videos.push({
                                url: src,
                                originalUrl: src,
                                quality: `${type} - ${quality}p`
                            });
                        }
                    });
                } else if (type === 'Download') {
                    const finalLink = finalDoc.selectFirst("a[download]")?.getHref;
                    if (finalLink) {
                        videos.push({
                            url: finalLink,
                            originalUrl: finalLink,
                            quality: `${type} - ${qualityName}`
                        });
                    }
                }
            };

            if (sourceTypePref === "both" || sourceTypePref === "stream") {
                 await processLink(tabContent.selectFirst("a.link-show"), 'Stream');
            }
            if (sourceTypePref === "both" || sourceTypePref === "download") {
                await processLink(tabContent.selectFirst("a.link-download"), 'Download');
            }
        }

        if (videos.length === 0) {
            throw new Error("لم يتم العثور على مصادر فيديو للنوع المحدد. ربما تغير هيكل الموقع.");
        }

        const preferredQuality = this.getPreference("preferred_quality");
        if (preferredQuality) {
            videos.sort((a, b) => {
                const aIsPreferred = a.quality.includes(preferredQuality);
                const bIsPreferred = b.quality.includes(preferredQuality);
                if (aIsPreferred && !bIsPreferred) return -1;
                if (!aIsPreferred && bIsPreferred) return 1;
                const aQualityNum = parseInt(a.quality.match(/\d+/)?.[0] || 0);
                const bQualityNum = parseInt(b.quality.match(/\d+/)?.[0] || 0);
                return bQualityNum - aQualityNum;
            });
        }
        
        return videos;
    }
    
    getFilterList() {
        const f = (name, value) => ({ type_name: "SelectOption", name, value });

        return [
            { type_name: "HeaderFilter", name: "فلترات البحث" },
            { type_name: "SeparatorFilter" },
            { type_name: "SelectFilter", name: "الأقسام", state: 0, values: [ f("الكل", "0"), f("افلام", "movie"), f("مسلسلات", "series"), f("تلفزيون", "show") ]},
            { type_name: "SelectFilter", name: "التقيم", state: 0, values: [ f("التقييم", "0"), f("1+", "1"), f("2+", "2"), f("3+", "3"), f("4+", "4"), f("5+", "5"), f("6+", "6"), f("7+", "7"), f("8+", "8"), f("9+", "9") ]},
            { type_name: "SelectFilter", name: "الجودة", state: 0, values: [ f("الكل", "0"), f("BluRay", "BluRay"), f("WebRip", "WebRip"), f("BRRIP", "BRRIP"), f("DVDrip", "DVDrip"), f("DVDSCR", "DVDSCR"), f("HD", "HD"), f("HDTS", "HDTS"), f("HDTV", "HDTV"), f("CAM", "CAM"), f("WEB-DL", "WEB-DL"), f("HDTC", "HDTC"), f("BDRIP", "BDRIP"), f("HDRIP", "HDRIP"), f("HC HDRIP", "HC+HDRIP") ]},
            { type_name: "SelectFilter", name: "الدقة", state: 0, values: [ f("الدقة", "0"), f("240p", "240p"), f("360p", "360p"), f("480p", "480p"), f("720p", "720p"), f("1080p", "1080p"), f("3D", "3D"), f("4K", "4K") ]},
            { type_name: "HeaderFilter", name: "تصفح الموقع (تعمل فقط لو كان البحث فارغ)" },
            { type_name: "SeparatorFilter" },
            { type_name: "SelectFilter", name: "النوع", state: 0, values: [ f("افلام", "movies"), f("مسلسلات", "series") ]},
            { type_name: "SelectFilter", name: "القسم", state: 0, values: [ f("القسم", "0"), f("عربي", "29"), f("اجنبي", "30"), f("هندي", "31"), f("تركي", "32"), f("اسيوي", "33") ]},
            { type_name: "SelectFilter", name: "التصنيف", state: 0, values: [
                f("التصنيف", "0"), f("رمضان", "87"), f("انمي", "30"), f("اكشن", "18"), f("مدبلج", "71"), f("NETFLIX", "72"),
                f("كوميدي", "20"), f("اثارة", "35"), f("غموض", "34"), f("عائلي", "33"), f("اطفال", "88"), f("حربي", "25"),
                f("رياضي", "32"), f("قصير", "89"), f("فانتازيا", "43"), f("خيال علمي", "24"), f("موسيقى", "31"),
                f("سيرة ذاتية", "29"), f("وثائقي", "28"), f("رومانسي", "27"), f("تاريخي", "26"), f("دراما", "23"),
                f("رعب", "22"), f("جريمة", "21"), f("مغامرة", "19"), f("غربي", "91")
            ]},
            { type_name: "SelectFilter", name: "التقييم", state: 0, values: [ f("التقييم", "0"), f("1+", "1"), f("2+", "2"), f("3+", "3"), f("4+", "4"), f("5+", "5"), f("6+", "6"), f("7+", "7"), f("8+", "8"), f("9+", "9") ]},
        ];
    }
    
    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "تجاوز الرابط الأساسي",
                summary: "استخدام رابط/نطاق مختلف للمصدر",
                value: this.source.baseUrl,
                dialogTitle: "أدخل الرابط الأساسي الجديد",
                dialogMessage: `الافتراضي: ${this.source.baseUrl}`,
            }
        }, {
            key: "video_source_type",
            listPreference: {
                title: "مصدر الفيديو المفضل",
                summary: "اختر بين إظهار روابط المشاهدة أو التحميل أو كليهما.",
                valueIndex: 0,
                entries: ["مشاهدة وتحميل", "مشاهدة فقط", "تحميل فقط"],
                entryValues: ["both", "stream", "download"],
            }
        }, {
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة",
                summary: "سيتم إعطاء الأولوية لهذه الجودة في قائمة الفيديوهات.",
                valueIndex: 0,
                entries: ["1080p", "720p", "480p", "360p", "240p"],
                entryValues: ["1080", "720", "480", "360", "240"],
            }
        }];
    }
}
