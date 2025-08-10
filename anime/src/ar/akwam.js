const mangayomiSources = [{
    "name": "أكوام",
    "id": 872036737,
    "lang": "ar",
    "baseUrl": "https://ak.sv",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=ak.sv",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
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

    getBaseUrl() {
        return this.source.baseUrl;
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

    parseAnimeFromElement(element) {
        const imageElement = element.selectFirst("picture img");
        return {
            name: imageElement.attr("alt"),
            imageUrl: imageElement.attr("data-src"),
            link: element.attr("href")
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

        let path;
        const params = new URLSearchParams();
        params.append('page', page);

        if (query) {
            params.append('q', query);
            const section = getSelectValue(filters[2]);
            const rating = getSelectValue(filters[3]);
            const format = getSelectValue(filters[4]);
            const quality = getSelectValue(filters[5]);

            if (section !== '0') params.append('section', section);
            if (rating !== '0') params.append('rating', rating);
            if (format !== '0') params.append('formats', format);
            if (quality !== '0') params.append('quality', quality);

            path = `/search?${params.toString()}`;
        } else {
            const type = getSelectValue(filters[8]);
            const sectionS = getSelectValue(filters[9]);
            const categoryS = getSelectValue(filters[10]);
            const ratingS = getSelectValue(filters[11]);
            
            if (sectionS !== '0') params.append('section', sectionS);
            if (categoryS !== '0') params.append('category', categoryS);
            if (ratingS !== '0') params.append('rating', ratingS);

            path = `/${type}?${params.toString()}`;
        }
        
        const doc = await this.requestDoc(path);
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
        const status = 1; // Completed

        const chapters = [];
        const episodeElements = doc.select("div.bg-primary2 h2 a");
        if (episodeElements.length === 0) {
            // Movie
            const movieElement = doc.selectFirst("input#reportInputUrl");
            if (movieElement) {
                chapters.push({
                    name: "مشاهدة",
                    url: movieElement.attr("value")
                });
            }
        } else {
            // Series
            episodeElements.forEach(element => {
                chapters.push({
                    name: element.text,
                    url: element.getHref
                });
            });
        }
        
        return { name, genre: genres, author, description, status, link: url, chapters };
    }
    
    async getVideoList(url) {
        const doc = await this.requestDoc(url);
        
        const linkShow = doc.selectFirst("a.link-show");
        if (!linkShow) {
            throw new Error("Video link not found.");
        }
        const watchPart = linkShow.getHref;
        const pageId = doc.selectFirst("input#page_id")?.attr("value");

        if (!pageId) {
             throw new Error("Page ID not found.");
        }

        const watchPath = watchPart.substring(watchPart.indexOf("/watch"));
        const iframeUrl = `${this.getBaseUrl()}${watchPath}/${pageId}`;
        const referer = this.getBaseUrl() + url;

        const iframeDoc = await this.requestDoc(iframeUrl.replace(this.getBaseUrl(), ''), referer);

        const videos = [];
        iframeDoc.select("source").forEach(element => {
            const src = element.attr("src").replace("https", "http");
            videos.push({
                url: src,
                originalUrl: src,
                quality: `${element.attr("size")}p`
            });
        });

        const preferredQuality = this.getPreference("preferred_quality");
        if (preferredQuality) {
            videos.sort((a, b) => {
                const aIsPreferred = a.quality.includes(preferredQuality);
                const bIsPreferred = b.quality.includes(preferredQuality);
                if (aIsPreferred && !bIsPreferred) return -1;
                if (!aIsPreferred && bIsPreferred) return 1;
                return 0; // Or further sort by quality numerically if needed
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
            key: "preferred_quality",
            listPreference: {
                title: "Preferred quality",
                summary: "%s",
                valueIndex: 0,
                entries: ["1080p", "720p", "480p", "360p", "240p"],
                entryValues: ["1080", "720", "480", "360", "240"],
            }
        }];
    }
}