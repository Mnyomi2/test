const mangayomiSources = [{
    "name": "Topcinema",
    "id": 645835682,
    "baseUrl": "https://web6.topcinema.cam",
    "lang": "ar",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://web6.topcinema.cam",
    "itemType": 1,
    "version": "1.0.2",
    "pkgPath": "anime/src/ar/topcinema.js",
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this._allSources = mangayomiSources;
        this.source.baseUrl = this.source.baseUrl.trim();
        this._defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36",
        };
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    async requestDoc(path, headers = {}) {
        const url = this.source.baseUrl + path;
        const res = await this.request(url, headers);
        return new Document(res.body);
    }

    async request(url, headers = {}) {
        const requestHeaders = { ...this._defaultHeaders, ...headers };
        const res = await this.client.get(url, { headers: requestHeaders });
        return res;
    }

    resolveRelativeUrl(path, baseUrl) {
        if (!path) return baseUrl;
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        const baseOriginMatch = baseUrl.match(/^(https?:\/\/[^/]+)/);
        const baseOrigin = baseOriginMatch ? baseOriginMatch[1] : '';
        if (path.startsWith('/')) return `${baseOrigin}${path}`;
        const lastSlashIndex = baseUrl.lastIndexOf('/');
        const basePath = (lastSlashIndex > (baseOrigin.length + 2)) ? baseUrl.substring(0, lastSlashIndex + 1) : `${baseOrigin}/`;
        return `${basePath}${path}`;
    }

    _titleEdit(title) { 
        let editedTitle = title ? title.trim() : ""; 
        if (!editedTitle) return editedTitle;
        const arabicSeasonMap = { "الاول": "1", "الثاني": "2", "الثالث": "3", "الرابع": "4", "الخامس": "5", "السادس": "6", "السابع": "7", "الثامن": "8", "التاسع": "9", "العاشر": "10", "الحادي عشر": "11", "الثاني عشر": "12" };
        editedTitle = editedTitle.replace(/[\u2013\u2014\u2015\u2212]/g, '-');
        editedTitle = editedTitle.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*\[.*?\]\s*/g, ' ');
        let extractedYear = '';
        editedTitle = editedTitle.replace(/\b(\d{4})\b/, (match, p1) => { extractedYear = p1; return ''; });
        editedTitle = editedTitle.replace(/^(?:فيلم|عرض|مسلسل|برنامج|انمي)\s+/i, '');
        for (const key in arabicSeasonMap) {
            const regex = new RegExp(`الموسم\\s*(?:ال)*${key}\\b`, 'gi'); 
            editedTitle = editedTitle.replace(regex, `الموسم ${arabicSeasonMap[key]}`);
        }
        editedTitle = editedTitle.replace(/الموسم\s*(\d+)/gi, 's$1').replace(/الحلقة\s*(\d+)/gi, 'E$1');
        editedTitle = editedTitle.replace(/\s+(?:مترجم|مترجمة|مدبلج|مدبلجة|اون لاين|اونلاين|كامل|بجودة|جودة|عالية|حصريا|مشاهدة)\s*$/gi, '');
        editedTitle = editedTitle.replace(/\b(?:HD|4K|FHD|UHD|HDRip|BluRay|WEB-DL|720p|1080p)\b/gi, '');
        editedTitle = editedTitle.replace(/\s+/g, ' ');
        if (extractedYear) editedTitle += ` (${extractedYear})`;
        return editedTitle.trim();
    }

    async _processListingItems(doc) {
        const list = [];
        const items = doc.select("div.Block--Item, div.Small--Box");
        for (const item of items) {
            const linkElement = item.selectFirst("a");
            if (!linkElement) continue;
            const link = linkElement.getHref;
            const rawTitle = linkElement.attr("title") || item.selectFirst("h3.title")?.text;
            const name = this._titleEdit(rawTitle);
            const imageUrl = item.selectFirst("img")?.attr("data-src");
            if (link.includes('/series/')) {
                try {
                    const seriesDoc = await this.requestDoc(link.replace(this.source.baseUrl, ''));
                    const seasonElements = seriesDoc.select("section.allseasonss div.Small--Box.Season");
                    if (seasonElements.length > 0) {
                        for (const season of seasonElements) {
                            const sLinkEl = season.selectFirst("a");
                            if (!sLinkEl) continue;
                            const sTitle = sLinkEl.attr("title") || season.selectFirst("h3.title")?.text;
                            list.push({ name: this._titleEdit(sTitle), imageUrl: season.selectFirst("img")?.attr("data-src"), link: sLinkEl.getHref });
                        }
                    } else list.push({ name, imageUrl, link });
                } catch (e) { list.push({ name, imageUrl, link }); }
            } else list.push({ name, imageUrl, link });
        }
        return list;
    }

    async getPopular(page) {
        const doc = await this.requestDoc(`/movies/page/${page}/`); 
        return { list: await this._processListingItems(doc), hasNextPage: !!doc.selectFirst("div.pagination a.next") };
    }

    async getLatestUpdates(page) {
        const doc = await this.requestDoc(`/recent/page/${page}/`);
        return { list: await this._processListingItems(doc), hasNextPage: !!doc.selectFirst("div.pagination a.next") };
    }

    async search(query, page, filters) {
        let path;
        const categoryFilter = filters[0];
        if (query) {
            path = `/search/?query=${encodeURIComponent(query)}&offset=${page - 1}`;
        } else {
            const selectedCategory = categoryFilter.values[categoryFilter.state].value;
            if (selectedCategory) {
                path = `${selectedCategory.endsWith('/') ? selectedCategory : selectedCategory + '/'}page/${page}/`;
            } else return this.getPopular(page);
        }
        const doc = await this.requestDoc(path);
        return { list: await this._processListingItems(doc), hasNextPage: !!doc.selectFirst("div.pagination a.next") };
    }

    async getDetail(url) {
        const doc = await this.requestDoc(url.replace(this.source.baseUrl, ''));
        const name = this._titleEdit(doc.selectFirst("h1.post-title")?.text);
        const imageUrl = doc.selectFirst("div.image img")?.getSrc;
        const description = doc.selectFirst("div.story")?.text.trim();
        const genre = doc.select("div.catssection li a").map(e => e.text);
        const chapters = [];
        const episodeElements = doc.select("section.allepcont div.row a");
        if (episodeElements.length > 0) {
            episodeElements.forEach(ep => chapters.push({ name: this._titleEdit(ep.attr("title")), url: ep.getHref }));
        } else {
            chapters.push({ name: "مشاهدة", url: url });
        }
        return { name, imageUrl, description, genre, status: 1, chapters, link: url };
    }

    async getVideoList(url) {
        const allStreams = [];
        const downloadPagePath = url.replace(this.source.baseUrl, '') + (url.endsWith('/') ? 'download/' : '/download/');
        const downloadPageDoc = await this.requestDoc(downloadPagePath, { "Referer": url });
        const vidtubeLinkElement = downloadPageDoc.selectFirst("div.proServer a.downloadsLink.proServer.green");
        if (!vidtubeLinkElement) return [];

        const vidtubeQualityPageUrl = vidtubeLinkElement.getHref;
        const vidtubeOriginMatch = vidtubeQualityPageUrl.match(/^(https?:\/\/[^/]+)/);
        const vidtubeOrigin = vidtubeOriginMatch ? vidtubeOriginMatch[1] : '';
        if (!vidtubeOrigin) return [];

        const vidtubeQualityPageDoc = await this.request(vidtubeQualityPageUrl, { "Referer": this.source.baseUrl + downloadPagePath }).then(res => new Document(res.body));
        const qualityLinkElements = vidtubeQualityPageDoc.select("div.row.mb-3 a.btn.btn-light");
        
        for (const linkElement of qualityLinkElements) {
            try {
                const relativePath = linkElement.getHref;
                const absoluteUrl = this.resolveRelativeUrl(relativePath, vidtubeOrigin);
                const qualityText = linkElement.selectFirst("b.text-primary")?.text.trim() || "Unknown";
                const sizeText = linkElement.selectFirst("span.small.text-muted")?.text.trim() || "";
                let quality = sizeText ? `${qualityText} (${sizeText})` : qualityText;

                const finalPageDoc = await this.request(absoluteUrl, { "Referer": vidtubeQualityPageUrl }).then(res => new Document(res.body));
                const finalVideoUrl = finalPageDoc.selectFirst("a.btn.btn-gradient.submit-btn")?.getHref;
                if (finalVideoUrl) {
                    allStreams.push({ url: finalVideoUrl, originalUrl: finalVideoUrl, quality: quality, headers: { "Referer": vidtubeOrigin } });
                }
            } catch (e) {}
        }

        allStreams.sort((a, b) => {
            const numA = parseInt(a.quality.match(/\d+/)?.[0] || '0');
            const numB = parseInt(b.quality.match(/\d+/)?.[0] || '0');
            return numB - numA;
        });

        const preferredQuality = this.getPreference("preferred_quality");
        if (!preferredQuality || preferredQuality === "Auto") {
            return allStreams;
        }

        const qualityKeywords = {
            "1080p": ["1080", "fhd", "original"],
            "720p": ["720", "hd"],
            "480p": ["480", "sd"],
            "240p": ["240", "sd"]
        };

        const targetKeywords = qualityKeywords[preferredQuality] || [preferredQuality];
        
        const filteredStreams = allStreams.filter(stream => {
            const streamQualityLower = stream.quality.toLowerCase();
            return targetKeywords.some(keyword => streamQualityLower.includes(keyword));
        });

        if (filteredStreams.length > 0) {
            return filteredStreams;
        }

        return allStreams;
    }

    getFilterList() {
        const categories = [{"name": "اختر", "query": ""}, {"name": "كل الافلام", "query": "/movies/"}, {"name": "افلام اجنبى", "query": "/category/افلام-اجنبي-3/"}, {"name": "افلام انمى", "query": "/category/افلام-انمي-1/"}, {"name": "افلام اسيويه", "query": "/category/افلام-اسيوي/"}, {"name": "افلام نتفليكس", "query": "/netflix-movies/"}, {"name": "سلاسل الافلام", "query": "/movies/"}, {"name": "الاعلي تقييما", "query": "/top-rating-imdb/"}, {"name": "مسلسلات اجنبى", "query": "/category/مسلسلات-اجنبي/"}, {"name": "مسلسلات اجنبى نتفليكس", "query": "/netflix-series/?cat=7"}, {"name": "مسلسلات اسيوية", "query": "/category/مسلسلات-اسيوية-7/"}, {"name": "مسلسلات اسيوية نتفليكس", "query": "/netflix-series/?cat=9"}, {"name": "مسلسلات انمي", "query": "/category/مسلسلات-انمي-1/"}, {"name": "مسلسلات انمي نتفلكس", "query": "/netflix-series/?cat=8"}, {"name": "احدث حلقات الانمي", "query": "/category/مسلسلات-انمي-1/?key=episodes"}];
        return [{type_name: "SelectFilter", name: "الأقسام", state: 0, values: categories.map(c => ({type_name: "SelectOption", name: c.name, value: c.query}))}];
    }

    getSourcePreferences() {
        return [{
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة",
                summary: "اختر الجودة المفضلة للفيديو",
                valueIndex: 0,
                entries: ["تلقائي (الأفضل)", "1080p FHD", "720p HD", "480p SD", "240p SD"],
                entryValues: ["Auto", "1080p", "720p", "480p", "240p"]
            }
        }];
    }
}

new DefaultExtension();
