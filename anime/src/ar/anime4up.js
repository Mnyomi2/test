// --- METADATA ---
const mangayomiSources = [{
    "name": "Anime4up",
    "id": 8374956845,
    "lang": "ar",
    "baseUrl": "https://ww.anime4up.rest",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=ww.anime4up.rest",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.5.5",
    "pkgPath": "anime/src/ar/anime4up.js"
}];

// --- CLASS ---
class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    // --- PREFERENCES AND HEADERS ---

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl() + "/",
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }

    // --- HELPER METHODS ---

    async fetchAndParseCataloguePage(path) {
        const url = this.getBaseUrl() + path;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
    
        const items = doc.select("div.anime-card-themex, div.row.posts-row article");
        const promises = items.map(async (item) => {
            if (item.is("div.anime-card-themex")) {
                const linkElement = item.selectFirst("div.anime-card-title h3 a");
                if (!linkElement) return [];
                
                const itemUrl = linkElement.getHref;
                try {
                    const itemRes = await this.client.get(itemUrl, this.getHeaders(itemUrl));
                    const itemDoc = new Document(itemRes.body);
    
                    const seasonHeader = itemDoc.selectFirst("div.main-didget-head h3:contains(مواسم)");
                    if (seasonHeader) {
                        const seasonElements = itemDoc.select(".episodes-list-content .themexblock .pinned-card");
                        return seasonElements.map(seasonElement => {
                            const seasonLinkElement = seasonElement.selectFirst("a");
                            const seasonNameElement = seasonElement.selectFirst("h3");
                            const style = seasonLinkElement.attr("style");
                            const imageUrlMatch = style.match(/url\(['"]?(.*?)['"]?\)/);
                            const imageUrl = imageUrlMatch ? imageUrlMatch[1] : '';
    
                            return {
                                name: seasonNameElement.text.trim(),
                                imageUrl: imageUrl,
                                link: seasonLinkElement.getHref.replace(/^https?:\/\/[^\/]+/, '')
                            };
                        }).filter(s => s.name && s.link);
                    } else {
                        const imageElement = item.selectFirst("img");
                        return [{
                            name: linkElement.text.trim(),
                            imageUrl: imageElement.attr('data-image'),
                            link: linkElement.getHref.replace(/^https?:\/\/[^\/]+/, '')
                        }];
                    }
                } catch (e) {
                    return [];
                }
            } else if (item.is("article")) {
                 const linkElement = item.selectFirst("h3.post-title a");
                 const imageElement = item.selectFirst("img");
                 if (linkElement && imageElement) {
                    return [{
                        name: linkElement.text.trim(),
                        imageUrl: imageElement.getSrc,
                        link: linkElement.getHref 
                    }];
                 }
                 return [];
            }
            return [];
        });
    
        const results = await Promise.all(promises);
        const list = results.flat();
    
        const hasNextPage = doc.selectFirst("ul.pagination li a[href*='page='], a.next.page-numbers") != null;
        return { list, hasNextPage };
    }


    getNumericQuality(quality) {
        const q = quality.toLowerCase();
        if (q.includes("fhd") || q.includes("1080")) return "1080p";
        if (q.includes("hd") || q.includes("720")) return "720p";
        if (q.includes("sd") || q.includes("480")) return "480p";
        return "720p";
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        const path = `/قائمة-الانمي/page/${page}/`;
        return this.fetchAndParseCataloguePage(path);
    }

    async getLatestUpdates(page) {
        const path = `/episode/page/${page}/`;
        const result = await this.fetchAndParseCataloguePage(path);
    
        const fixedList = result.list.map(item => ({
            ...item,
            link: item.link
                .replace(/^https?:\/\/[^\/]+/, '')
                .replace(/-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-.*$/, "")
                .replace("/episode/", "/anime/")
        }));
    
        return { list: fixedList, hasNextPage: result.hasNextPage };
    }

    async search(query, page, filters) {
        let urlPath;
    
        if (query) {
            urlPath = `/?search_param=animes&s=${encodeURIComponent(query)}&paged=${page}`;
        } else {
            const sectionFilter = filters.find(f => f.name === "القسم");
            const genreFilter = filters.find(f => f.name === "تصنيف الأنمي");
            const statusFilter = filters.find(f => f.name === "حالة الأنمي");
            const typeFilter = filters.find(f => f.name === "النوع");
            const seasonFilter = filters.find(f => f.name === "الموسم");
            
            let basePath = "";
            
            if (sectionFilter && sectionFilter.state > 0) {
                const value = sectionFilter.values[sectionFilter.state].value;
                basePath = `/anime-category/${value}/`;
            } else if (genreFilter && genreFilter.state > 0) {
                const value = genreFilter.values[genreFilter.state].value;
                basePath = `/anime-genre/${value}/`;
            } else if (statusFilter && statusFilter.state > 0) {
                const value = statusFilter.values[statusFilter.state].value;
                basePath = `/anime-status/${value}/`;
            } else if (typeFilter && typeFilter.state > 0) {
                const value = typeFilter.values[typeFilter.state].value;
                basePath = `/anime-type/${value}/`;
            } else if (seasonFilter && seasonFilter.state > 0) {
                const value = seasonFilter.values[seasonFilter.state].value;
                basePath = `/anime-season/${value}/`;
            }
    
            if (basePath) {
                urlPath = `${basePath}?page=${page}`;
            } else {
                urlPath = `/قائمة-الانمي/page/${page}/`;
            }
        }
        return this.fetchAndParseCataloguePage(urlPath);
    }

    async getDetail(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders(this.getBaseUrl() + url));
        const doc = new Document(res.body);
    
        const name = doc.selectFirst("h1.anime-details-title").text;
        const imageUrl = doc.selectFirst("div.anime-thumbnail img.thumbnail").getSrc;
        const description = doc.selectFirst("p.anime-story").text;
        const link = url;
    
        const statusText = doc.selectFirst("div.anime-info:contains(حالة الأنمي) a")?.text ?? '';
        const status = { "يعرض الان": 0, "مكتمل": 1 }[statusText] ?? 5;
    
        const genre = doc.select("ul.anime-genres > li > a").map(e => e.text);
    
        const chapters = [];
        const episodeElements = doc.select("div.episodes-list-content div.pinned-card a.badge.light-soft");
        for (const element of episodeElements) {
            chapters.push({
                name: element.text.trim(),
                url: element.getHref.replace(/^https?:\/\/[^\/]+/, '')
            });
        }
        chapters.reverse();
    
        return { name, imageUrl, description, link, status, genre, chapters };
    }

    // --- VIDEO EXTRACTION ---

    async mp4uploadExtractor(url, quality) {
        const embedUrl = url.startsWith("//") ? "https:" + url : url;
        const embedHtml = (await this.client.get(embedUrl, this.getHeaders(embedUrl))).body;

        const sourceMatch = embedHtml.match(/player\.src\({[^}]+src:\s*"([^"]+)"/);
        if (sourceMatch && sourceMatch[1]) {
            const videoUrl = sourceMatch[1];
            return [{
                url: videoUrl,
                originalUrl: videoUrl,
                quality: quality,
                headers: { "Referer": embedUrl }
            }];
        }
        throw new Error("Mp4upload: Could not find video source.");
    }

    async getVideoList(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders(this.getBaseUrl() + url));
        const doc = new Document(res.body);
        let videos = [];
        const hosterSelection = this.getPreference("hoster_selection") || ["Dood", "Voe", "Mp4upload", "Okru"];
        const headers = this.getHeaders(this.getBaseUrl() + url);

        const linkElements = doc.select('#episode-servers li a');
        for (const element of linkElements) {
            try {
                let streamUrl = element.attr('data-ep-url');
                const qualityText = element.text.trim();
                const serverName = qualityText.split(' - ')[0];

                if (streamUrl.startsWith("//")) streamUrl = "https:" + streamUrl;

                const numericQuality = this.getNumericQuality(qualityText);
                const finalQualityString = `${serverName} - ${numericQuality}`;

                if (serverName.includes("Mp4upload") && hosterSelection.includes("Mp4upload")) {
                    videos.push(...(await this.mp4uploadExtractor(streamUrl, finalQualityString)));
                } else if (serverName.includes("Dood") && hosterSelection.includes("Dood")) {
                    videos.push({ url: streamUrl, quality: finalQualityString, headers });
                } else if (serverName.includes("Ok.ru") && hosterSelection.includes("Okru")) {
                    videos.push({ url: streamUrl, quality: finalQualityString, headers });
                } else if (serverName.includes("Voe.sx") && hosterSelection.includes("Voe")) {
                    videos.push({ url: streamUrl, quality: finalQualityString, headers });
                }
            } catch (e) { /* Ignore errors from single hoster */ }
        }

        const preferredQuality = this.getPreference("preferred_quality") || "720";
        videos.sort((a, b) => {
            const qualityA = parseInt(a.quality.match(/(\d+)p/)?.[1] || 0);
            const qualityB = parseInt(b.quality.match(/(\d+)p/)?.[1] || 0);
            if (a.quality.includes(preferredQuality)) return -1;
            if (b.quality.includes(preferredQuality)) return 1;
            return qualityB - qualityA;
        });

        return videos;
    }

    // --- FILTERS AND PREFERENCES ---

    getFilterList() {
        const getSlug = (href) => href.split('/').filter(Boolean).pop();

        const sections = [
            { name: 'الكل', value: '' },
            { name: 'الانمي المترجم', value: getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%aa%d8%b1%d8%ac%d9%85/')},
            { name: 'الانمي المدبلج', value: getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%af%d8%a8%d9%84%d8%ac/')}
        ].map(s => ({ type_name: "SelectOption", name: s.name, value: s.value }));

        const genres = [
            { name: 'الكل', value: '' }, { name: 'أطفال', value: 'أطفال' }, { name: 'أكشن', value: 'أكشن' },
            { name: 'إيتشي', value: 'إيتشي' }, { name: 'اثارة', value: 'اثارة' }, { name: 'الحياة العملية', value: 'الحياة-العملية' },
            { name: 'العاب', value: 'العاب' }, { name: 'بوليسي', value: 'بوليسي' }, { name: 'تاريخي', value: 'تاريخي' },
            { name: 'جنون', value: 'جنون' }, { name: 'جوسي', value: 'جوسي' }, { name: 'حربي', value: 'حربي' },
            { name: 'حريم', value: 'حريم' }, { name: 'خارق للعادة', value: 'خارق-للعادة' }, { name: 'خيال علمي', value: 'خيال-علمي' },
            { name: 'دراما', value: 'دراما' }, { name: 'رعب', value: 'رعب' }, { name: 'رومانسي', value: 'رومانسي' },
            { name: 'رياضي', value: 'رياضي' }, { name: 'ساموراي', value: 'ساموراي' }, { name: 'سباق', value: 'سباق' },
            { name: 'سحر', value: 'سحر' }, { name: 'سينين', value: 'سينين' }, { name: 'شريحة من الحياة', value: 'شريحة-من-الحياة' },
            { name: 'شوجو', value: 'شوجو' }, { name: 'شوجو اَي', value: 'شوجو-اَي' }, { name: 'شونين', value: 'شونين' },
            { name: 'شونين اي', value: 'شونين-اي' }, { name: 'شياطين', value: 'شياطين' }, { name: 'طبي', value: 'طبي' },
            { name: 'غموض', value: 'غموض' }, { name: 'فضائي', value: 'فضائي' }, { name: 'فنتازيا', value: 'فنتازيا' },
            { name: 'فنون تعبيرية', value: 'فنون-تعبيرية' }, { name: 'فنون قتالية', value: 'فنون-قتالية' }, { name: 'قوى خارقة', value: 'قوى-خارقة' },
            { name: 'كوميدي', value: 'كوميدي' }, { name: 'مأكولات', value: 'مأكولات' }, { name: 'محاكاة ساخرة', value: 'محاكاة-ساخرة' },
            { name: 'مدرسي', value: 'مدرسي' }, { name: 'مصاصي دماء', value: 'مصاصي-دماء' }, { name: 'مغامرات', value: 'مغامرات' },
            { name: 'موسيقي', value: 'موسيقي' }, { name: 'ميكا', value: 'ميكا' }, { name: 'نفسي', value: 'نفسي' },
        ].map(g => ({ type_name: "SelectOption", name: g.name, value: encodeURIComponent(g.value) }));
    
        const statuses = [
            { name: 'الكل', value: '' },
            { name: 'لم يعرض بعد', value: getSlug('https://ww.anime4up.rest/anime-status/%d9%84%d9%85-%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a8%d8%b9%d8%af/')},
            { name: 'مكتمل', value: 'complete'},
            { name: 'يعرض الان', value: getSlug('https://ww.anime4up.rest/anime-status/%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a7%d9%84%d8%a7%d9%86-1/')}
        ].map(s => ({ type_name: "SelectOption", name: s.name, value: s.value }));
        
        const types = [
            { name: 'الكل', value: '' },
            { name: 'Movie', value: 'movie-3' }, { name: 'ONA', value: 'ona1' },
            { name: 'OVA', value: 'ova1' }, { name: 'Special', value: 'special1' }, { name: 'TV', value: 'tv2' }
        ].map(t => ({ type_name: "SelectOption", name: t.name, value: t.value }));
    
        const seasons = [{ name: 'الكل', value: '', sortKey: '9999' }];
        const currentYear = new Date().getFullYear();
        const seasonMap = { 'spring': 'ربيع', 'summer': 'صيف', 'fall': 'خريف', 'winter': 'شتاء' };
        for (let year = currentYear + 2; year >= 2000; year--) {
            Object.entries(seasonMap).forEach(([eng, arb], index) => {
                const seasonSlug = `${arb}-${year}`;
                seasons.push({ 
                    name: `${arb} ${year}`, 
                    value: encodeURIComponent(seasonSlug),
                    sortKey: `${year}-${4-index}`
                });
            });
        }
        const seasonOptions = seasons.sort((a, b) => b.sortKey.localeCompare(a.sortKey))
                                     .map(s => ({ type_name: "SelectOption", name: s.name, value: s.value }));
    
        return [
            { type_name: "HeaderFilter", name: "ملاحظة: سيتم تجاهل الفلاتر في حال البحث بالاسم." },
            { type_name: "SelectFilter", name: "القسم", state: 0, values: sections },
            { type_name: "SelectFilter", name: "تصنيف الأنمي", state: 0, values: genres },
            { type_name: "SelectFilter", name: "حالة الأنمي", state: 0, values: statuses },
            { type_name: "SelectFilter", name: "النوع", state: 0, values: types },
            { type_name: "SelectFilter", name: "الموسم", state: 0, values: seasonOptions },
        ];
    }

    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "تجاوز عنوان URL الأساسي",
                summary: "استخدم دومين مختلف للمصدر",
                value: this.source.baseUrl,
                dialogTitle: "أدخل عنوان URL الأساسي الجديد",
                dialogMessage: "الإفتراضي: " + this.source.baseUrl,
            }
        }, {
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة",
                summary: "اختر الجودة التي سيتم اختيارها تلقائيا",
                valueIndex: 1,
                entries: ["1080p", "720p", "480p", "360p"],
                entryValues: ["1080", "720", "480", "360"],
            }
        }, {
            key: "hoster_selection",
            multiSelectListPreference: {
                title: "اختر السيرفرات",
                summary: "اختر السيرفرات التي تريد ان تظهر",
                entries: ["Dood", "Voe", "Mp4upload", "Okru"],
                entryValues: ["Dood", "Voe", "Mp4upload", "Okru"],
                values: ["Dood", "Voe", "Mp4upload", "Okru"],
            }
        }];
    }
}
