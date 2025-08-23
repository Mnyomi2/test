const mangayomiSources = [{
    "name": "EpornerApi",
    "id": 987654321,
    "lang": "en",
    "baseUrl": "https://www.eporner.com",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://www.eporner.com",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/epornerapi.js"
}];

class DefaultExtension extends MProvider {
    // Helper function to safely extract text from a DOM element
    getText(element) {
        return element?.text?.trim() || '';
    }

    // Helper function to safely extract an attribute from a DOM element
    getAttr(element, attr) {
        return element?.attr(attr)?.trim() || '';
    }

    constructor() {
        super();
        this.client = new Client();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    // ---------------------------
    // Helpers
    // ---------------------------
    _buildAbsoluteUrl(baseUrl, relativeUrl) {
        const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const relative = relativeUrl.startsWith('/') ? relativeUrl.slice(1) : relativeUrl;
        return `${base}/${relative}`;
    }

    _buildSearchUrl(query, page, filters) {
        const perPage = 30;
        const thumbsize = this.getPreference("eporner_thumbsize") || "big";
        const order = filters.order || this.getPreference("eporner_order") || "latest";
        const gay = filters.gay || this.getPreference("eporner_gay") || "0";
        const lq = filters.lq || this.getPreference("eporner_lq") || "1";
        const production = filters.production || this.getPreference("eporner_production") || "";

        let baseQuery = query || "all";
        let finalQuery;

        if (production) {
            if (baseQuery === "all") {
                finalQuery = production;
            } else {
                finalQuery = `${baseQuery} ${production}`;
            }
        } else {
            finalQuery = baseQuery;
        }

        return `${this.source.baseUrl}/api/v2/video/search/?query=${encodeURIComponent(finalQuery)}&per_page=${perPage}&page=${page}&thumbsize=${thumbsize}&order=${order}&gay=${gay}&lq=${lq}&format=json`;
    }

    _formatDesc(v) {
        const length = v.length_min ? `${v.length_min} min` : 'N/A';
        const views = v.views ? `${v.views} views` : 'N/A';
        const rate = v.rate ? `⭐ ${v.rate}` : '';
        return `${length} • ${views} ${rate}`;
    }

    // ---------------------------
    // Mandatory Methods
    // ---------------------------

    async getPopular(page) {
        try {
            const filters = { order: this.getPreference("eporner_order") || "most-popular" };
            const url = this._buildSearchUrl("all", page, filters);
            const res = await this.client.get(url);
            const data = JSON.parse(res.body);
            if (!data || !Array.isArray(data.videos)) throw new Error("Invalid API response");

            const list = data.videos.map(v => ({
                name: v.title,
                link: v.url,
                imageUrl: v.default_thumb.src,
                description: this._formatDesc(v)
            }));
            return { list, hasNextPage: data.page < data.total_pages };
        } catch (e) {
            throw new Error(`Failed to fetch popular videos: ${e.message}`);
        }
    }

    async getLatestUpdates(page) {
        try {
            const url = this._buildSearchUrl("all", page, { order: "latest" });
            const res = await this.client.get(url);
            const data = JSON.parse(res.body);
            if (!data || !Array.isArray(data.videos)) throw new Error("Invalid API response");

            const list = data.videos.map(v => ({
                name: v.title,
                link: v.url,
                imageUrl: v.default_thumb.src,
                description: this._formatDesc(v)
            }));
            return { list, hasNextPage: data.page < data.total_pages };
        } catch (e) {
            throw new Error(`Failed to fetch latest updates: ${e.message}`);
        }
    }

    async search(query, page, filters) {
        try {
            const mappedFilters = {};
            if (filters) {
                filters.forEach(f => {
                    const selectedOption = f.values[f.state];
                    if (selectedOption) {
                        if (f.name === "Order") mappedFilters.order = selectedOption.value;
                        if (f.name === "Production") mappedFilters.production = selectedOption.value;
                        if (f.name === "Gay Content") mappedFilters.gay = selectedOption.value;
                        if (f.name === "Low Quality") mappedFilters.lq = selectedOption.value;
                    }
                });
            }
            const url = this._buildSearchUrl(query, page, mappedFilters);
            const res = await this.client.get(url);
            const data = JSON.parse(res.body);
            if (!data || !Array.isArray(data.videos)) throw new Error("Invalid API response");

            const list = data.videos.map(v => ({
                name: v.title,
                link: v.url,
                imageUrl: v.default_thumb.src,
                description: this._formatDesc(v)
            }));
            return { list, hasNextPage: data.page < data.total_pages };
        } catch (e) {
            throw new Error(`Failed to perform search: ${e.message}`);
        }
    }

    async getDetail(url) {
        try {
            const res = await this.client.get(url);
            const document = new Document(res.body);

            // 1. Extract Name & Image
            const name = this.getText(document.selectFirst("h1.title-video")) || 
                         this.getText(document.selectFirst("title"))?.replace(/ - Eporner$/i, '').trim() || 
                         "Unknown Title";
            const imageUrl = this.getAttr(document.selectFirst('meta[property="og:image"]'), 'content') ||
                             "https://www.google.com/s2/favicons?sz=256&domain=https://www.eporner.com";

            // 2. Extract structured metadata
            const pornstars = document.select('li.vit-pornstar a').map(el => this.getText(el)).filter(Boolean);
            const categories = document.select('li.vit-category a').map(el => this.getText(el)).filter(Boolean);
            const tags = document.select('li.vit-tag a').map(el => this.getText(el)).filter(Boolean);
            const uploader = this.getText(document.selectFirst('li.vit-uploader a'));

            // 3. Combine categories, tags, and pornstars for the main `genres` array
            const genres = [...new Set([...pornstars, ...categories, ...tags])];

            // 4. Build a rich description
            let mainDescription = this.getAttr(document.selectFirst('meta[property="og:description"]'), 'content');
            if (mainDescription) {
                mainDescription = mainDescription.replace(/Eporner is the largest hd porn source\.$/i, '').trim();
            }

            const detailsParts = [];
            if (pornstars.length > 0) detailsParts.push(`Starring: ${pornstars.join(', ')}`);
            if (uploader) detailsParts.push(`Uploader: ${uploader}`);
            
            const stats = [];
            const durationText = this.getText(document.selectFirst('span.duration'));
            if (durationText) stats.push(`Length: ${durationText}`);
            const viewsText = this.getText(document.selectFirst('span.views_count, span.video-info-views'));
            if (viewsText) stats.push(`Views: ${viewsText}`);
            const ratingText = this.getText(document.selectFirst('.stars-rating .vote-box-number, .star-rating-score'));
            if (ratingText) stats.push(`Rating: ${ratingText}`);
            if (stats.length > 0) detailsParts.push(`Stats: ${stats.join(' • ')}`);

            let finalDescription = mainDescription || '';
            if (detailsParts.length > 0) {
                finalDescription += `\n\n---\n\n${detailsParts.join('\n')}`;
            }
            if (categories.length > 0) finalDescription += `\n\nCategories: ${categories.join(', ')}`;
            if (tags.length > 0) finalDescription += `\n\nTags: ${tags.join(', ')}`;
            
            return {
                name, imageUrl,
                description: finalDescription.trim() || "No description available.",
                genres,
                link: url,
                chapters: [{ name: "Watch Video", url }],
                status: 0
            };
        } catch (e) {
            throw new Error(`Failed to get video details for ${url}: ${e.message}`);
        }
    }

    async getVideoList(url) {
        try {
            const res = await this.client.get(url);
            const document = new Document(res.body);
            const videoList = [];

            const downloadLinks = document.select("div#downloaddiv a");
            if (downloadLinks.length === 0) {
                throw new Error("No video download links found on the page.");
            }

            for (let i = 0; i < downloadLinks.length; i++) {
                const linkElement = downloadLinks[i];
                const relativePath = this.getAttr(linkElement, "href");
                const videoUrl = this._buildAbsoluteUrl(this.source.baseUrl, relativePath);
                const linkText = this.getText(linkElement);

                const qualityMatch = linkText.match(/(\d+p)(?:\((\d+K)\))?(@\d+fps)?(\sHD)?/i);
                let qualityLabel = "UNKNOWN";
                if (qualityMatch) {
                    qualityLabel = `${qualityMatch[1]?.toUpperCase() || ''}${qualityMatch[2] ? ` (${qualityMatch[2]}K)` : ''}${qualityMatch[3] || ''} ${qualityMatch[4]?.trim() || ''}`.trim();
                }

                const codecMatch = linkText.match(/(AV1|h264)/i);
                const codec = codecMatch ? codecMatch[1].toUpperCase() : "H264";

                const sizeMatch = linkText.match(/(\d+(?:\.\d+)?\s*(?:MB|GB))/i);
                const size = sizeMatch ? ` (${sizeMatch[1].trim()})` : "";
                
                videoList.push({
                    url: videoUrl,
                    originalUrl: url,
                    quality: `${qualityLabel} (${codec})${size}`,
                    headers: { Referer: this.source.baseUrl }
                });
            }

            const preferredQuality = this.getPreference("eporner_quality") || "best_available";
            const preferredCodec = this.getPreference("eporner_codec") || "best";

            videoList.sort((a, b) => {
                const parseQuality = (q) => {
                    const resMatch = q.match(/(\d+)P/i);
                    const frameMatch = q.match(/@(\d+)fps/i);
                    const codecMatch = q.match(/\((AV1|H264)\)/i);
                    return {
                        resolution: resMatch ? parseInt(resMatch[1]) : 0,
                        framerate: frameMatch ? parseInt(frameMatch[1]) : 30,
                        codec: codecMatch ? codecMatch[1].toUpperCase() : "H264"
                    };
                };

                const aParsed = parseQuality(a.quality);
                const bParsed = parseQuality(b.quality);
                const codecOrder = { "AV1": 2, "H264": 1 };

                if (preferredQuality !== "best_available") {
                    const preferredRes = parseInt(preferredQuality);
                    if (aParsed.resolution === preferredRes && bParsed.resolution !== preferredRes) return -1;
                    if (bParsed.resolution === preferredRes && aParsed.resolution !== preferredRes) return 1;
                }

                if (aParsed.resolution !== bParsed.resolution) return bParsed.resolution - aParsed.resolution;
                if (aParsed.framerate !== bParsed.framerate) return bParsed.framerate - aParsed.framerate;

                if (preferredCodec !== 'best') {
                    if (aParsed.codec.toLowerCase() === preferredCodec && bParsed.codec.toLowerCase() !== preferredCodec) return -1;
                    if (bParsed.codec.toLowerCase() === preferredCodec && aParsed.codec.toLowerCase() !== preferredCodec) return 1;
                }

                return (codecOrder[bParsed.codec] || 0) - (codecOrder[aParsed.codec] || 0);
            });

            return videoList;
        } catch (e) {
            throw new Error(`Failed to get video list for ${url}: ${e.message}`);
        }
    }

    getSourcePreferences() {
        return [
            {
                key: "eporner_order",
                listPreference: {
                    title: "Default Sort", summary: "Sorting order for Popular / Latest", valueIndex: 0,
                    entries: ["Most Popular", "Top-Rated", "Latest", "Longest", "Shortest", "Top Weekly", "Top Monthly"],
                    entryValues: ["most-popular", "top-rated", "latest", "longest", "shortest", "top-weekly", "top-monthly"]
                }
            },
            {
                key: "eporner_production",
                listPreference: {
                    title: "Default Production Type", summary: "Filter by professional or homemade content by default.", valueIndex: 0,
                    entries: ["All", "Professional", "Homemade"], entryValues: ["", "professional", "homemade"]
                }
            },
            {
                key: "eporner_gay",
                listPreference: {
                    title: "Gay Content", summary: "Filter content based on 'gay' flag in API", valueIndex: 0,
                    entries: ["Exclude", "Include", "Only"], entryValues: ["0", "1", "2"]
                }
            },
            {
                key: "eporner_lq",
                listPreference: {
                    title: "Low Quality", summary: "Filter content based on 'low quality' flag in API", valueIndex: 1,
                    entries: ["Exclude", "Include", "Only"], entryValues: ["0", "1", "2"]
                }
            },
            {
                key: "eporner_thumbsize",
                listPreference: {
                    title: "Thumbnail Size", summary: "Size of thumbnails in listings", valueIndex: 2,
                    entries: ["Small", "Medium", "Big"], entryValues: ["small", "medium", "big"]
                }
            },
            {
                key: "eporner_quality",
                listPreference: {
                    title: "Preferred Video Quality", summary: "Select your preferred resolution. The best version (e.g., framerate, codec) will be prioritized.", valueIndex: 0,
                    entries: ["Best Available", "2160P (4K)", "1440P (2K)", "1080P", "720P", "480P", "360P", "240P"],
                    entryValues: ["best_available", "2160", "1440", "1080", "720", "480", "360", "240"]
                }
            },
            {
                key: "eporner_codec",
                listPreference: {
                    title: "Preferred Video Codec", summary: "AV1 offers better quality for file size but H264 is more compatible with older devices.", valueIndex: 0,
                    entries: ["Best Available", "AV1", "H264"], entryValues: ["best", "av1", "h264"]
                }
            }
        ];
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter", name: "Order", state: 0,
                values: [
                    { type_name: "SelectOption", name: "Most Popular", value: "most-popular" },
                    { type_name: "SelectOption", name: "Top-Rated", value: "top-rated" },
                    { type_name: "SelectOption", name: "Latest", value: "latest" },
                    { type_name: "SelectOption", name: "Longest", value: "longest" },
                    { type_name: "SelectOption", name: "Shortest", value: "shortest" },
                    { type_name: "SelectOption", name: "Top Weekly", value: "top-weekly" },
                    { type_name: "SelectOption", name: "Top Monthly", value: "top-monthly" }
                ]
            },
            {
                type_name: "SelectFilter", name: "Production", state: 0,
                values: [
                    { type_name: "SelectOption", name: "All", value: "" },
                    { type_name: "SelectOption", name: "Professional", value: "professional" },
                    { type_name: "SelectOption", name: "Homemade", value: "homemade" },
                ]
            },
            {
                type_name: "SelectFilter", name: "Gay Content", state: 0,
                values: [
                    { type_name: "SelectOption", name: "Exclude", value: "0" },
                    { type_name: "SelectOption", name: "Include", value: "1" },
                    { type_name: "SelectOption", name: "Only", value: "2" }
                ]
            },
            {
                type_name: "SelectFilter", name: "Low Quality", state: 1,
                values: [
                    { type_name: "SelectOption", name: "Exclude", value: "0" },
                    { type_name: "SelectOption", name: "Include", value: "1" },
                    { type_name: "SelectOption", name: "Only", value: "2" }
                ]
            }
        ];
    }
}
