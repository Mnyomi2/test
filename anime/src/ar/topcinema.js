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
        // Define a consistent User-Agent for all external requests
        this._defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36",
        };
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    // Centralized request method for fetching a Document (HTML parsing)
    async requestDoc(path, headers = {}) {
        const url = this.source.baseUrl + path;
        const res = await this.request(url, headers);
        return new Document(res.body);
    }

    // Centralized request method for raw HTTP response
    async request(url, headers = {}) {
        const requestHeaders = { ...this._defaultHeaders, ...headers };
        const res = await this.client.get(url, { headers: requestHeaders });
        return res;
    }

    /**
     * Helper function to resolve relative URLs.
     * @param {string} path The potentially relative URL path.
     * @param {string} baseUrl The base URL to resolve against.
     * @returns {string} The resolved absolute URL.
     */
    resolveRelativeUrl(path, baseUrl) {
        if (!path) return baseUrl;
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
        }
        const baseOriginMatch = baseUrl.match(/^(https?:\/\/[^/]+)/);
        const baseOrigin = baseOriginMatch ? baseOriginMatch[1] : '';
        if (path.startsWith('/')) {
            return `${baseOrigin}${path}`;
        }
        const lastSlashIndex = baseUrl.lastIndexOf('/');
        const basePath = (lastSlashIndex > (baseOrigin.length + 2)) ? baseUrl.substring(0, lastSlashIndex + 1) : `${baseOrigin}/`;
        return `${basePath}${path}`;
    }

    _titleEdit(title) { 
        let editedTitle = title ? title.trim() : ""; 
        if (!editedTitle) return editedTitle;

        const arabicSeasonMap = {
            "الاول": "1", "الثاني": "2", "الثالث": "3", "الرابع": "4", "الخامس": "5",
            "السادس": "6", "السابع": "7", "الثامن": "8", "التاسع": "9", "العاشر": "10",
            "الحادي عشر": "11", "الثاني عشر": "12", "الثالث عشر": "13", "الرابع عشر": "14", "الخامس عشر": "15"
        };
        editedTitle = editedTitle.replace(/[\u2013\u2014\u2015\u2212]/g, '-');
        editedTitle = editedTitle.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*\[.*?\]\s*/g, ' ');
        let extractedYear = '';
        editedTitle = editedTitle.replace(/\b(\d{4})\b/, (match, p1) => {
            extractedYear = p1;
            return ''; 
        });
        editedTitle = editedTitle.replace(/^(?:فيلم|عرض|مسلسل|برنامج|انمي)\s+/i, '');
        for (const key in arabicSeasonMap) {
            const regex = new RegExp(`الموسم\\s*(?:ال)*${key}\\b`, 'gi'); 
            editedTitle = editedTitle.replace(regex, `الموسم ${arabicSeasonMap[key]}`);
        }
        editedTitle = editedTitle.replace(/الموسم\s*(\d+)/gi, 's$1');
        editedTitle = editedTitle.replace(/الحلقة\s*(\d+)/gi, 'E$1');
        editedTitle = editedTitle.replace(/\s+(?:مترجم|مترجمة|مدبلج|مدبلجة|اون لاين|اونلاين|كامل|بجودة عالية|جودة عالية|حصريا|مشاهدة)\s*$/gi, '');
        editedTitle = editedTitle.replace(/\b(?:HD|4K|FHD|UHD|HDRip|BluRay|WEB-DL|720p|1080p)\b/gi, '');
        editedTitle = editedTitle.replace(/\s+/g, ' ');
        if (extractedYear) {
            editedTitle += ` (${extractedYear})`;
        }
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
                    const seriesDetailPageDoc = await this.requestDoc(link.replace(this.source.baseUrl, ''));
                    const seasonElements = seriesDetailPageDoc.select("section.allseasonss div.Small--Box.Season");

                    if (seasonElements.length > 0) {
                        for (const seasonItem of seasonElements) {
                            const seasonLinkElement = seasonItem.selectFirst("a");
                            if (!seasonLinkElement) continue;
                            const seasonRawTitle = seasonLinkElement.attr("title") || seasonItem.selectFirst("h3.title")?.text;
                            const seasonName = this._titleEdit(seasonRawTitle);
                            const seasonImageUrl = seasonItem.selectFirst("img")?.attr("data-src"); 
                            const seasonLink = seasonLinkElement.getHref;
                            list.push({ name: seasonName, imageUrl: seasonImageUrl, link: seasonLink });
                        }
                    } else {
                        list.push({ name, imageUrl, link });
                    }
                } catch (error) {
                    list.push({ name, imageUrl, link });
                }
            } else {
                list.push({ name, imageUrl, link });
            }
        }
        return list;
    }

    async getPopular(page) {
        const doc = await this.requestDoc(`/movies/page/${page}/`); 
        const list = await this._processListingItems(doc); 
        const hasNextPage = !!doc.selectFirst("div.pagination a.next");
        return { list, hasNextPage };
    }

    async getLatestUpdates(page) {
        const doc = await this.requestDoc(`/recent/page/${page}/`);
        const list = await this._processListingItems(doc); 
        const hasNextPage = !!doc.selectFirst("div.pagination a.next");
        return { list, hasNextPage };
    }

    async search(query, page, filters) {
        let path;
        const categoryFilter = filters[0];   
        if (query) {
            path = `/search/?query=${encodeURIComponent(query)}&offset=${page - 1}`; 
        } else {
            const selectedCategory = categoryFilter.values[categoryFilter.state].value;
            if (selectedCategory) {
                let basePath = selectedCategory; 
                path = `${basePath.endsWith('/') ? basePath : basePath + '/'}page/${page}/`;
            } else {
                return this.getPopular(page);
            }
        }
        const doc = await this.requestDoc(path); 
        const list = await this._processListingItems(doc); 
        const hasNextPage = !!doc.selectFirst("div.pagination a.next");
        return { list, hasNextPage };
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
            episodeElements.forEach(ep => {
                const epUrl = ep.getHref; 
                const cleanEpName = this._titleEdit(ep.attr("title"));
                chapters.push({ name: cleanEpName, url: epUrl }); 
            });
        } else { 
            chapters.push({ name: this._titleEdit("مشاهدة"), url: url }); 
        }
        return { name, imageUrl, description, genre, status: 1, chapters, link: url };
    }

    async getVideoList(url) {
        const streams = [];

        // Step 1: Construct the download page URL from the original episode/movie URL.
        // e.g., ".../episode-slug/" -> ".../episode-slug/download/"
        const downloadPagePath = url.replace(this.source.baseUrl, '') + (url.endsWith('/') ? 'download/' : '/download/');
        
        // Fetch the Topcinema download page.
        const downloadPageDoc = await this.requestDoc(downloadPagePath, {
            "Referer": url 
        });

        // Step 2: Find the VidTube link on the Topcinema download page.
        // The selector targets the green VidTube server button.
        const vidtubeLinkElement = downloadPageDoc.selectFirst("div.proServer a.downloadsLink.proServer.green");
        
        if (!vidtubeLinkElement) {
            console.warn("No VidTube download link found on: " + this.source.baseUrl + downloadPagePath);
            return streams; // Return empty if no VidTube link exists.
        }

        const vidtubeQualityPageUrl = vidtubeLinkElement.getHref; // e.g., https://vidtube.pro/d/cza0vtsn1wtr.html
        
        // Safely extract the origin (e.g., "https://vidtube.pro") for resolving relative links later.
        const vidtubeOriginMatch = vidtubeQualityPageUrl.match(/^(https?:\/\/[^/]+)/);
        const vidtubeOrigin = vidtubeOriginMatch ? vidtubeOriginMatch[1] : '';

        if (!vidtubeOrigin) {
            console.error("Could not extract origin from VidTube URL: " + vidtubeQualityPageUrl);
            return streams;
        }

        // Step 3: Fetch the VidTube quality selection page.
        const vidtubeQualityPageDoc = await this.request(vidtubeQualityPageUrl, {
            "Referer": this.source.baseUrl + downloadPagePath // Referer from Topcinema download page.
        }).then(res => new Document(res.body));

        // Step 4: Extract all available quality download links from the VidTube page.
        const qualityLinkElements = vidtubeQualityPageDoc.select("div.row.mb-3 a.btn.btn-light");

        for (const linkElement of qualityLinkElements) {
            try {
                // The link is relative, e.g., "/d/cza0vtsn1wtr_x"
                const relativeQualityPath = linkElement.getHref;
                // Resolve it to an absolute URL, e.g., "https://vidtube.pro/d/cza0vtsn1wtr_x"
                const absoluteQualityUrl = this.resolveRelativeUrl(relativeQualityPath, vidtubeOrigin);
                
                // Extract quality and size text.
                const qualityText = linkElement.selectFirst("b.text-primary")?.text.trim() || "Unknown Quality";
                const sizeText = linkElement.selectFirst("span.small.text-muted")?.text.trim() || "";

                let quality = qualityText;
                if (sizeText) {
                    quality += ` (${sizeText})`; // Combine for a more descriptive name, e.g., "1080p FHD (1920x1072, 476.7 MB)"
                }

                // Step 5: Fetch the final download page for this specific quality.
                const finalDownloadPageDoc = await this.request(absoluteQualityUrl, {
                    "Referer": vidtubeQualityPageUrl // Referer from the VidTube quality selection page.
                }).then(res => new Document(res.body));

                // Step 6: Extract the direct video URL.
                const directDownloadLinkElement = finalDownloadPageDoc.selectFirst("a.btn.btn-gradient.submit-btn");
                const finalVideoUrl = directDownloadLinkElement?.getHref;

                if (finalVideoUrl) {
                    streams.push({
                        url: finalVideoUrl,
                        originalUrl: finalVideoUrl,
                        quality: quality,
                        headers: {
                            // The Referer from VidTube's domain is crucial for the video to play.
                            "Referer": vidtubeOrigin,
                        }
                    });
                }
            } catch (error) {
                console.error(`Error processing a quality link:`, error);
            }
        }
        
        // Optional: Sort streams from highest to lowest quality based on the number in the quality string.
        streams.sort((a, b) => {
            const numA = parseInt(a.quality.match(/\d+/)?.[0] || '0');
            const numB = parseInt(b.quality.match(/\d+/)?.[0] || '0');
            return numB - numA;
        });

        return streams;
    }

    getFilterList() {
        const categories = [{"name": "اختر", "query": ""}, {"name": "كل الافلام", "query": "/movies/"}, {"name": "افلام اجنبى", "query": "/category/افلام-اجنبي-3/"}, {"name": "افلام انمى", "query": "/category/افلام-انمي-1/"}, {"name": "افلام اسيويه", "query": "/category/افلام-اسيوي/"}, {"name": "افلام نتفليكس", "query": "/netflix-movies/"}, {"name": "سلاسل الافلام", "query": "/movies/"}, {"name": "الاعلي تقييما", "query": "/top-rating-imdb/"}, {"name": "مسلسلات اجنبى", "query": "/category/مسلسلات-اجنبي/"}, {"name": "مسلسلات اجنبى نتفليكس", "query": "/netflix-series/?cat=7"}, {"name": "مسلسلات اسيوية", "query": "/category/مسلسلات-اسيوية-7/"}, {"name": "مسلسلات اسيوية نتفليكس", "query": "/netflix-series/?cat=9"}, {"name": "مسلسلات انمي", "query": "/category/مسلسلات-انمي-1/"}, {"name": "مسلسلات انمي نتفلكس", "query": "/netflix-series/?cat=8"}, {"name": "احدث حلقات الانمي", "query": "/category/مسلسلات-انمي-1/?key=episodes"}];
        return [{type_name: "SelectFilter", name: "الأقسام", state: 0, values: categories.map(c => ({type_name: "SelectOption", name: c.name, value: c.query}))}];
    }

    getSourcePreferences() {
        return [{key: "preferred_quality", listPreference: {title: "الجودة المفضلة", summary: "اختر الجودة المفضلة لديك", value: "720", entries: ["1080p FHD", "720p HD", "480p SD", "Auto"], entryValues: ["1080p", "720", "480", "Auto"]}}];
    }
}

new DefaultExtension();
