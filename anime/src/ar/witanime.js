const mangayomiSources = [{
    "name": "WitAnime",
    "id": 984372845,
    "lang": "ar",
    "baseUrl": "https://witanime.com",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://witanime.com",
    "typeSource": "multi",
    "itemType": 1,
    "version": "2.0.2",
    "pkgPath": "anime/src/ar/witanime.js"
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

    getHeaders() {
        return {
            "Referer": this.getBaseUrl() + "/",
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }

    // --- HELPER METHODS ---

    async fetchAndParseCataloguePage(path) {
        const url = this.getBaseUrl() + path;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const list = [];
        const items = doc.select(".anime-card-container, div.row.posts-row article");

        for (const item of items) {
            const linkElement = item.selectFirst("div.anime-card-title h3 a, h3.post-title a");
            const imageElement = item.selectFirst("img.img-responsive");

            if (linkElement && imageElement) {
                const name = linkElement.text.trim();
                const link = linkElement.getHref.replace(/^https?:\/\/[^\/]+/, '');
                const imageUrl = imageElement.getSrc;
                list.push({ name, imageUrl, link });
            }
        }

        const hasNextPage = doc.selectFirst("a.next.page-numbers") != null;
        return { list, hasNextPage };
    }

    getNumericQuality(quality) {
        const q = quality.toLowerCase();
        if (q.includes("fhd") || q.includes("1080")) return "1080p";
        if (q.includes("hd") || q.includes("720")) return "720p";
        if (q.includes("sd") || q.includes("480")) return "480p";
        return "720p"; // Default quality
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        const path = `/anime-list/page/${page}/`;
        return this.fetchAndParseCataloguePage(path);
    }

    async getLatestUpdates(page) {
        const path = `/episode/page/${page}/`;
        const result = await this.fetchAndParseCataloguePage(path);

        const fixedList = result.list.map(item => ({
            ...item,
            link: item.link
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
                basePath = `/anime-category/${sectionFilter.values[sectionFilter.state].value}/`;
            } else if (genreFilter && genreFilter.state > 0) {
                basePath = `/anime-genre/${genreFilter.values[genreFilter.state].value}/`;
            } else if (statusFilter && statusFilter.state > 0) {
                basePath = `/anime-status/${statusFilter.values[statusFilter.state].value}/`;
            } else if (typeFilter && typeFilter.state > 0) {
                basePath = `/anime-type/${typeFilter.values[typeFilter.state].value}/`;
            } else if (seasonFilter && seasonFilter.state > 0) {
                basePath = `/anime-season/${seasonFilter.values[seasonFilter.state].value}/`;
            }
    
            if (basePath) {
                urlPath = `${basePath}page/${page}/`;
            } else {
                urlPath = `/anime-list/page/${page}/`;
            }
        }
        return this.fetchAndParseCataloguePage(urlPath);
    }

    async getDetail(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders());
        const doc = new Document(res.body);

        const name = doc.selectFirst("h1.anime-details-title").text;
        const imageUrl = doc.selectFirst("div.anime-thumbnail img.thumbnail").getSrc;
        const description = doc.selectFirst("p.anime-story").text;
        const link = url;

        const statusText = doc.selectFirst("div.anime-info:contains(حالة الأنمي) a")?.text ?? '';
        const status = { "يعرض الان": 0, "مكتمل": 1 }[statusText] ?? 5;

        const genre = doc.select("ul.anime-genres > li > a").map(e => e.text);

        const chapters = [];
        const episodeElements = doc.select(".episodes-card-title h3 a");
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
        const embedHtml = (await this.client.get(embedUrl, this.getHeaders())).body;

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
        const fullUrl = this.getBaseUrl() + url;
        const res = await this.client.get(fullUrl, this.getHeaders());
        const doc = new Document(res.body);
        let videos = [];
        const hosterSelection = this.getPreference("hoster_selection") || ["Dood", "Voe", "Mp4upload", "Okru"];
        const headers = this.getHeaders();

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

        if (videos.length === 0) {
            throw new Error("No videos found from the selected hosters.");
        }

        return videos;
    }

    // --- FILTERS AND PREFERENCES ---

    getFilterList() {
        const f = (name, value) => ({ type_name: "SelectOption", name, value });
        
        const sections = [
            f('الكل', ''),
            f('الانمي المترجم', 'الانمي-المترجم'),
            f('الانمي المدبلج', 'الانمي-المدبلج')
        ];

        const genres = [
            f('الكل', ''), f('أطفال', 'أطفال'), f('أكشن', 'أكشن'),
            f('إيتشي', 'إيتشي'), f('اثارة', 'اثارة'), f('الحياة العملية', 'الحياة-العملية'), 
            f('العاب', 'العاب'), f('بوليسي', 'بوليسي'), f('تاريخي', 'تاريخي'),
            f('جنون', 'جنون'), f('جوسي', 'جوسي'), f('حربي', 'حربي'),
            f('حريم', 'حريم'), f('خارق للعادة', 'خارق-للعادة'), f('خيال علمي', 'خيال-علمي'),
            f('دراما', 'دراما'), f('رعب', 'رعب'), f('رومانسي', 'رومانسي'),
            f('رياضي', 'رياضي'), f('ساموراي', 'ساموراي'), f('سباق', 'سباق'),
            f('سحر', 'سحر'), f('سينين', 'سينين'), f('شريحة من الحياة', 'شريحة-من-الحياة'),
            f('شوجو', 'شوجو'), f('شوجو اَي', 'شوجو-اَي'), f('شونين', 'شونين'),
            f('شونين اي', 'شونين-اي'), f('شياطين', 'شياطين'), f('طبي', 'طبي'),
            f('غموض', 'غموض'), f('فضائي', 'فضائي'), f('فنتازيا', 'فنتازيا'),
            f('فنون تعبيرية', 'فنون-تعبيرية'), f('فنون قتالية', 'فنون-قتالية'), f('قوى خارقة', 'قوى-خارقة'),
            f('كوميدي', 'كوميدي'), f('مأكولات', 'مأكولات'), f('محاكاة ساخرة', 'محاكاة-ساخرة'),
            f('مدرسي', 'مدرسي'), f('مصاصي دماء', 'مصاصي-دماء'), f('مغامرات', 'مغامرات'),
            f('موسيقي', 'موسيقي'), f('ميكا', 'ميكا'), f('نفسي', 'نفسي'),
        ].map(g => f(g.name, encodeURIComponent(g.value)));
    
        const statuses = [
            f('الكل', ''), f('لم يعرض بعد', 'لم-يعرض-بعد'),
            f('مكتمل', 'complete'), f('يعرض الان', 'يعرض-الان-1')
        ];
        
        const types = [
            f('الكل', ''), f('Movie', 'movie-3'), f('ONA', 'ona1'),
            f('OVA', 'ova1'), f('Special', 'special1'), f('TV', 'tv2')
        ];
    
        const seasons = [f('الكل', '')];
        const currentYear = new Date().getFullYear();
        const seasonMap = { 'spring': 'ربيع', 'summer': 'صيف', 'fall': 'خريف', 'winter': 'شتاء' };
        for (let year = currentYear + 1; year >= 2000; year--) {
            Object.values(seasonMap).forEach(arbSeason => {
                const seasonSlug = `${arbSeason}-${year}`;
                seasons.push(f(`${arbSeason} ${year}`, encodeURIComponent(seasonSlug)));
            });
        }
    
        return [
            { type_name: "HeaderFilter", name: "ملاحظة: سيتم تجاهل الفلاتر في حال البحث بالاسم." },
            { type_name: "SelectFilter", name: "القسم", state: 0, values: sections },
            { type_name: "SelectFilter", name: "تصنيف الأنمي", state: 0, values: genres },
            { type_name: "SelectFilter", name: "حالة الأنمي", state: 0, values: statuses },
            { type_name: "SelectFilter", name: "النوع", state: 0, values: types },
            { type_name: "SelectFilter", name: "الموسم", state: 0, values: seasons },
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
                dialogMessage: `الإفتراضي: ${this.source.baseUrl}`,
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
