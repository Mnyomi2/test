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
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
        if (url) {
            headers["Referer"] = url;
        }
        return headers;
    }

    // --- HELPER METHODS ---

    async fetchAndParseCataloguePage(path) {
        const url = this.getBaseUrl() + path;
        const res = await this.client.get(url, this.getHeaders(url));
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

        const hasNextPage = doc.selectFirst("ul.pagination li a[href*='page='], a.next.page-numbers") != null;
        return { list, hasNextPage };
    }

    getNumericQuality(quality) {
        const q = quality.toLowerCase();
        if (q.includes("fhd") || q.includes("1080")) return "1080p";
        if (q.includes("hd") || q.includes("720")) return "720p";
        if (q.includes("sd") || q.includes("480")) return "480p";
        return "HD";
    }
    
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        return this.fetchAndParseCataloguePage(`/قائمة-الانمي/page/${page}/`);
    }

    async getLatestUpdates(page) {
        const result = await this.fetchAndParseCataloguePage(`/episode/page/${page}/`);
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
            const filterMap = {
                "القسم": "anime-category", "تصنيف الأنمي": "anime-genre",
                "حالة الأنمي": "anime-status", "النوع": "anime-type", "الموسم": "anime-season"
            };
            let basePath = "";
            for (const key in filterMap) {
                const filter = filters.find(f => f.name === key);
                if (filter && filter.state > 0) {
                    basePath = `/${filterMap[key]}/${filter.values[filter.state].value}/`;
                    break;
                }
            }
            urlPath = basePath ? `${basePath}?page=${page}` : `/قائمة-الانمي/page/${page}/`;
        }
        return this.fetchAndParseCataloguePage(urlPath);
    }

    async getDetail(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders(this.getBaseUrl() + url));
        const doc = new Document(res.body);

        const name = doc.selectFirst("h1.anime-details-title").text;
        const imageUrl = doc.selectFirst("div.anime-thumbnail img.thumbnail").getSrc;
        const description = doc.selectFirst("p.anime-story").text;
        const statusText = doc.selectFirst("div.anime-info:contains(حالة الأنمي) a")?.text ?? '';
        const status = { "يعرض الان": 0, "مكتمل": 1 }[statusText] ?? 5;
        const genre = doc.select("ul.anime-genres > li > a").map(e => e.text);
        
        const chapters = doc.select(".episodes-card-title h3 a").map(element => ({
            name: element.text.trim(),
            url: element.getHref.replace(/^https?:\/\/[^\/]+/, '')
        })).reverse();

        return { name, imageUrl, description, link: url, status, genre, chapters };
    }

    // --- VIDEO EXTRACTION ---

    async mp4uploadExtractor(url, quality) {
        const embedUrl = url.startsWith("//") ? `https:${url}` : url;
        const embedHtml = (await this.client.get(embedUrl, this.getHeaders(embedUrl))).body;
        const sourceMatch = embedHtml.match(/player\.src\({[^}]+src:\s*"([^"]+)"/);
        return sourceMatch ? [{ url: sourceMatch[1], originalUrl: url, quality, headers: { "Referer": embedUrl } }] : [];
    }

    async uupbomExtractor(url, quality) {
        try {
            const headers = this.getHeaders(url);
            const initialRes = await this.client.get(url, headers);
            const doc = new Document(initialRes.body);
            const countdownMatch = initialRes.body.match(/id="countdown_str".*?>.*?(\d+)/);
            if (countdownMatch) await this._sleep((parseInt(countdownMatch[1], 10) + 1) * 1000);
            
            const inputs = doc.select('form[name="F1"] input[type="hidden"]');
            if (inputs.length > 0) {
                const formData = {};
                inputs.forEach(i => formData[i.attr("name")] = i.attr("value"));
                formData['method_free'] = 'Free Download >>';
                const postRes = await this.client.post(url, headers, formData);
                const m = postRes.body.match(/direct_link[^>]+>\s*<a\s*href="([^"]+)"/i);
                if (m) return [{ url: m[1].trim(), originalUrl: url, quality, headers: { "Referer": url } }];
            }
        } catch (e) {}
        return [];
    }
    
    async vidmolyExtractor(url, quality) {
        const embedUrl = url.startsWith("//") ? `https:${url}` : url;
        const res = await this.client.get(embedUrl, this.getHeaders(embedUrl));
        const sourceMatch = res.body.match(/sources:\s*\[{file:"([^"]+)"/);
        return sourceMatch ? [{ url: sourceMatch[1], originalUrl: url, quality, headers: { "Referer": embedUrl } }] : [];
    }

    async megamaxExtractor(url, quality) {
        const embedUrl = url.startsWith("//") ? `https:${url}` : url;
        const res = await this.client.get(embedUrl, this.getHeaders(embedUrl));
        const sourceMatch = res.body.match(/sources:\[{file:"([^"]+)"/);
        if (sourceMatch) {
            let videoUrl = sourceMatch[1];
            if (videoUrl.startsWith("//")) videoUrl = `https:${videoUrl}`;
            return [{ url: videoUrl, originalUrl: url, quality, headers: { "Referer": embedUrl } }];
        }
        return [];
    }

    async vkExtractor(url, quality) {
        const embedUrl = url.startsWith("//") ? `https:${url}` : url;
        const res = await this.client.get(embedUrl, this.getHeaders(embedUrl));
        const videos = [];
        const qualities = ["url1080", "url720", "url480", "url360", "url240"];
        for (const q of qualities) {
            const urlMatch = res.body.match(new RegExp(`"${q}":"([^"]+)"`));
            if (urlMatch) videos.push({ url: urlMatch[1].replace(/\\/g, ""), originalUrl: url, quality: `VK - ${q.replace("url", "")}p`, headers: this.getHeaders(embedUrl) });
        }
        return videos;
    }
    
    async doodstreamExtractor(url, quality) {
        try {
            const domain = new URL(url).origin;
            const res = await this.client.get(url, this.getHeaders(url));
            const md5Match = res.body.match(/\/pass_md5\/([^']*)'/);
            if (!md5Match) return [];
            
            const passRes = await this.client.get(`${domain}${md5Match[1]}`, this.getHeaders(url));
            if (!passRes.body) return [];
            
            const videoPart = passRes.body;
            const randomString = Math.random().toString(36).substring(2, 12);
            const token = md5Match[1].split('/').pop();
            const videoUrl = `${videoPart}${randomString}?token=${token}&expiry=${Date.now()}`;
            return [{ url: videoUrl, originalUrl: url, quality, headers: this.getHeaders(url) }];
        } catch (e) { return []; }
    }

    async gofileExtractor(url, quality) {
        try {
            const contentId = url.split('/').pop();
            const apiRes = await this.client.get(`https://api.gofile.io/getContent?contentId=${contentId}`, this.getHeaders(url));
            const data = JSON.parse(apiRes.body);
            if (data.status === "ok" && data.data && data.data.contents) {
                const contentKeys = Object.keys(data.data.contents);
                if (contentKeys.length > 0 && data.data.contents[contentKeys[0]].link) {
                    return [{ url: data.data.contents[contentKeys[0]].link, originalUrl: url, quality, headers: this.getHeaders(url) }];
                }
            }
        } catch (e) {}
        return [];
    }
    
    async fileUploadExtractor(url, quality) {
        try {
            const headers = this.getHeaders(url);
            const initialRes = await this.client.get(url, headers);
            const countdownMatch = initialRes.body.match(/id="countdown".*?>(\d+)</);
            if (countdownMatch) await this._sleep((parseInt(countdownMatch[1], 10) + 1) * 1000);

            const doc = new Document(initialRes.body);
            const inputs = doc.select('form[name="F1"] input');
            if (inputs.length > 0) {
                const formData = {};
                inputs.forEach(i => formData[i.attr("name")] = i.attr("value"));
                const postRes = await this.client.post(url, headers, formData);
                const linkMatch = postRes.body.match(/class="btn btn-download[^"]*".*?href="([^"]+)"/);
                if (linkMatch) return [{ url: linkMatch[1], originalUrl: url, quality, headers: { "Referer": url } }];
            }
        } catch(e) {}
        return [];
    }

    async megaExtractor(url, quality) {
        if (url.includes("/embed/")) {
            const parts = url.split('!');
            const fileId = parts[0].split('/').pop();
            const fileKey = parts[1];
            url = `https://mega.nz/file/${fileId}#${fileKey}`;
        }
        return [{ url, originalUrl: url, quality }];
    }

    async videaExtractor(url, quality) {
        try {
            const embedUrl = url.startsWith("//") ? `https:${url}` : url;
            const res = await this.client.get(embedUrl, this.getHeaders(embedUrl));
            const videos = [];
            const sourcesMatch = res.body.match(/"video_sources":\s*({[^}]+})/);
            if (sourcesMatch && sourcesMatch[1]) {
                const sources = JSON.parse(sourcesMatch[1]);
                for (const q of ["1080p", "720p", "480p", "360p", "240p"]) {
                    if (sources[q] && sources[q][0]) {
                        let videoUrl = sources[q][0];
                        if (videoUrl.startsWith("//")) videoUrl = `https:${videoUrl}`;
                        videos.push({ url: videoUrl, originalUrl: url, quality: `Videa - ${q}`, headers: this.getHeaders(embedUrl) });
                    }
                }
            }
            return videos;
        } catch(e) { return []; }
    }
    
    async getVideoList(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders(this.getBaseUrl() + url));
        const doc = new Document(res.body);
        let videos = [];
        const processedUrls = new Set();
        const hosterSelection = this.getPreference("hoster_selection") || ["Dood", "Voe", "Mp4upload", "Uupbom", "Vidmoly", "Megamax", "VK", "Gofile", "FileUpload", "Mega", "Videa"];
    
        const extractors = {
            "Dood": { domains: ["dood", "vide0.net"], func: this.doodstreamExtractor },
            "Voe": { domains: ["voe.sx"], func: (u,q) => [{ url: u, quality: q, headers: this.getHeaders(u) }] },
            "Mp4upload": { domains: ["mp4upload"], func: this.mp4uploadExtractor },
            "Uupbom": { domains: ["uupbom"], func: this.uupbomExtractor },
            "Vidmoly": { domains: ["vidmoly"], func: this.vidmolyExtractor },
            "Megamax": { domains: ["megamax"], func: this.megamaxExtractor },
            "VK": { domains: ["vkvideo"], func: this.vkExtractor },
            "Gofile": { domains: ["gofile.io"], func: this.gofileExtractor },
            "FileUpload": { domains: ["file-upload.org"], func: this.fileUploadExtractor },
            "Mega": { domains: ["mega.nz"], func: this.megaExtractor },
            "Videa": { domains: ["videa.hu"], func: this.videaExtractor }
        };

        const elements = doc.select('#episode-servers li a, .episode-download-container .quality-list li a');
        for (const element of elements) {
            try {
                let streamUrl = element.attr('data-ep-url') || element.attr('href');
                if (!streamUrl || processedUrls.has(streamUrl)) continue;
                processedUrls.add(streamUrl);
                if (streamUrl.startsWith("//")) streamUrl = `https:${streamUrl}`;
                
                const qualityList = element.closest("ul.quality-list");
                const qualityHeader = qualityList ? qualityList.selectFirst("li")?.text ?? "" : "";
                const numericQuality = this.getNumericQuality(qualityHeader || element.text.trim());

                for (const key of hosterSelection) {
                    const extractor = extractors[key];
                    if (extractor.domains.some(d => streamUrl.includes(d) || element.text.trim().toLowerCase().includes(d))) {
                        videos.push(...(await extractor.func.call(this, streamUrl, `${key} - ${numericQuality}`)));
                        break;
                    }
                }
            } catch (e) {}
        }
    
        const preferredQuality = this.getPreference("preferred_quality") || "720";
        videos.sort((a, b) => {
            const aIsPreferred = a.quality.includes(preferredQuality);
            const bIsPreferred = b.quality.includes(preferredQuality);
            if (aIsPreferred !== bIsPreferred) return aIsPreferred ? -1 : 1;
            const qualityA = parseInt(a.quality.match(/(\d+)p/)?.[1] || 0);
            const qualityB = parseInt(b.quality.match(/(\d+)p/)?.[1] || 0);
            return qualityB - qualityA;
        });
        return videos;
    }

    // --- FILTERS AND PREFERENCES ---

    getFilterList() {
        const getSlug = (href) => href.split('/').filter(Boolean).pop();
        const sections = [{ name: 'الكل', value: '' }, { name: 'الانمي المترجم', value: getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%aa%d8%b1%d8%ac%d9%85/')}, { name: 'الانمي المدبلج', value: getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%af%d8%a8%d9%84%d8%ac/')}].map(s => ({ type_name: "SelectOption", name: s.name, value: s.value }));
        const genres = [{ name: 'الكل', value: '' }, { name: 'أطفال', value: 'أطفال' }, { name: 'أكشن', value: 'أكشن' }, { name: 'إيتشي', value: 'إيتشي' }, { name: 'اثارة', value: 'اثارة' }, { name: 'الحياة العملية', value: 'الحياة-العملية' }, { name: 'العاب', value: 'العاب' }, { name: 'بوليسي', value: 'بوليسي' }, { name: 'تاريخي', value: 'تاريخي' }, { name: 'جنون', value: 'جنون' }, { name: 'جوسي', value: 'جوسي' }, { name: 'حربي', value: 'حربي' }, { name: 'حريم', value: 'حريم' }, { name: 'خارق للعادة', value: 'خارق-للعادة' }, { name: 'خيال علمي', value: 'خيال-علمي' }, { name: 'دراما', value: 'دراما' }, { name: 'رعب', value: 'رعب' }, { name: 'رومانسي', value: 'رومانسي' }, { name: 'رياضي', value: 'رياضي' }, { name: 'ساموراي', value: 'ساموراي' }, { name: 'سباق', value: 'سباق' }, { name: 'سحر', value: 'سحر' }, { name: 'سينين', value: 'سينين' }, { name: 'شريحة من الحياة', value: 'شريحة-من-الحياة' }, { name: 'شوجو', value: 'شوجو' }, { name: 'شوجو اَي', value: 'شوجو-اَي' }, { name: 'شونين', value: 'شونين' }, { name: 'شونين اي', value: 'شونين-اي' }, { name: 'شياطين', value: 'شياطين' }, { name: 'طبي', value: 'طبي' }, { name: 'غموض', value: 'غموض' }, { name: 'فضائي', value: 'فضائي' }, { name: 'فنتازيا', value: 'فنتازيا' }, { name: 'فنون تعبيرية', value: 'فنون-تعبيرية' }, { name: 'فنون قتالية', value: 'فنون-قتالية' }, { name: 'قوى خارقة', value: 'قوى-خارقة' }, { name: 'كوميدي', value: 'كوميدي' }, { name: 'مأكولات', value: 'مأكولات' }, { name: 'محاكاة ساخرة', value: 'محاكاة-ساخرة' }, { name: 'مدرسي', value: 'مدرسي' }, { name: 'مصاصي دماء', value: 'مصاصي-دماء' }, { name: 'مغامرات', value: 'مغامرات' }, { name: 'موسيقي', value: 'موسيقي' }, { name: 'ميكا', value: 'ميكا' }, { name: 'نفسي', value: 'نفسي' },].map(g => ({ type_name: "SelectOption", name: g.name, value: encodeURIComponent(g.value) }));
        const statuses = [{ name: 'الكل', value: '' }, { name: 'لم يعرض بعد', value: getSlug('https://ww.anime4up.rest/anime-status/%d9%84%d9%85-%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a8%d8%b9%d8%af/')}, { name: 'مكتمل', value: 'complete'}, { name: 'يعرض الان', value: getSlug('https://ww.anime4up.rest/anime-status/%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a7%d9%84%d8%a7%d9%86-1/')}].map(s => ({ type_name: "SelectOption", name: s.name, value: s.value }));
        const types = [{ name: 'الكل', value: '' }, { name: 'Movie', value: 'movie-3' }, { name: 'ONA', value: 'ona1' }, { name: 'OVA', value: 'ova1' }, { name: 'Special', value: 'special1' }, { name: 'TV', value: 'tv2' }].map(t => ({ type_name: "SelectOption", name: t.name, value: t.value }));
        const seasons = [{ name: 'الكل', value: '', sortKey: '9999' }];
        const currentYear = new Date().getFullYear();
        const seasonMap = { 'spring': 'ربيع', 'summer': 'صيف', 'fall': 'خريف', 'winter': 'شتاء' };
        for (let year = currentYear + 2; year >= 2000; year--) {
            Object.entries(seasonMap).forEach(([eng, arb], index) => seasons.push({ name: `${arb} ${year}`, value: encodeURIComponent(`${arb}-${year}`), sortKey: `${year}-${4-index}` }));
        }
        const seasonOptions = seasons.sort((a, b) => b.sortKey.localeCompare(a.sortKey)).map(s => ({ type_name: "SelectOption", name: s.name, value: s.value }));
        return [{ type_name: "HeaderFilter", name: "ملاحظة: سيتم تجاهل الفلاتر في حال البحث بالاسم." }, { type_name: "SelectFilter", name: "القسم", state: 0, values: sections }, { type_name: "SelectFilter", name: "تصنيف الأنمي", state: 0, values: genres }, { type_name: "SelectFilter", name: "حالة الأنمي", state: 0, values: statuses }, { type_name: "SelectFilter", name: "النوع", state: 0, values: types }, { type_name: "SelectFilter", name: "الموسم", state: 0, values: seasonOptions },];
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
                entries: ["Dood", "Voe", "Mp4upload", "Uupbom", "Vidmoly", "Megamax", "VK", "Gofile", "FileUpload", "Mega", "Videa"],
                entryValues: ["Dood", "Voe", "Mp4upload", "Uupbom", "Vidmoly", "Megamax", "VK", "Gofile", "FileUpload", "Mega", "Videa"],
                values: ["Dood", "Voe", "Mp4upload", "Uupbom", "Vidmoly", "Megamax", "VK", "Gofile", "FileUpload", "Mega", "Videa"],
            }
        }];
    }
}
