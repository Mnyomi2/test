const mangayomiSources = [{
    "name": "Eporner",
    "id": 8911658567,
    "lang": "en",
    "baseUrl": "https://www.eporner.com",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://www.eporner.com",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/eporner.js"
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
        const overrideUrl = this.getPreference("override_base_url");
        return overrideUrl || this.source.baseUrl;
    }

    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl() + "/",
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        };
    }

    getQualityIndex(str) {
        const match = str.match(/(\d{3,4})[pP]/);
        if (match && match[1]) {
            return parseInt(match[1]);
        }
        return -1;
    }

    _parseStreamQuality(qualityString) {
        const resMatch = qualityString.match(/(\d{3,4})[pP]/);
        const codecMatch = qualityString.match(/\(([^)]+)\)/); // This will still get the codec part if it's "codec" or "codec, size"

        const resolution = resMatch ? resMatch[1] : null; // e.g., "1080"
        let codec = null;
        if (codecMatch && codecMatch[1]) {
            const parts = codecMatch[1].split(',').map(p => p.trim());
            if (parts.length >= 2) { // If it has "codec, size"
                codec = parts[0].toLowerCase(); // Use the first part as codec
            } else { // If it's just "codec"
                codec = codecMatch[1].toLowerCase();
            }
        }
        // No need to parse size here, as this helper is for resolution/codec matching

        return { resolution, codec };
    }

    _toMedia(item) {
        const linkElement = item.selectFirst("div.mbcontent a");
        const link = this.getBaseUrl() + (linkElement?.getHref || "/");

        const imageElement = item.selectFirst("img");
        const imageUrl = imageElement?.getSrc || imageElement?.attr("data-src") || "";

        const name = imageElement?.attr("alt")?.trim() || "Unknown Title";

        return {
            name,
            imageUrl,
            link
        };
    }

    async getPopular(page) {
        const url = `${this.getBaseUrl()}/best-videos/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const list = [];
        const vidResultsContainer = doc.selectFirst("div#vidresults");
        if (!vidResultsContainer) {
            console.error("Could not find #vidresults container for popular videos.");
            return { list: [], hasNextPage: false };
        }
        const items = vidResultsContainer.select("div.mbimg");

        for (const item of items) {
            list.push(this._toMedia(item));
        }

        const hasNextPage = list.length > 0;
        return {
            list,
            hasNextPage
        };
    }

    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/most-viewed/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const list = [];
        const vidResultsContainer = doc.selectFirst("div#vidresults");
        if (!vidResultsContainer) {
            console.error("Could not find #vidresults container for latest updates.");
            return { list: [], hasNextPage: false };
        }
        const items = vidResultsContainer.select("div.mbimg");

        for (const item of items) {
            list.push(this._toMedia(item));
        }

        const hasNextPage = list.length > 0;
        return {
            list,
            hasNextPage
        };
    }

    async search(query, page, filters) {
        let url = `${this.getBaseUrl()}/search/${encodeURIComponent(query)}/${page}/`;

        for (const filter of filters) {
            if (filter.type_name === "SelectFilter" && filter.name === "Sort By") {
                const selectedValue = filter.values[filter.state].value;
                if (selectedValue !== "search") {
                    if(selectedValue.startsWith("cat/")) {
                        url = `${this.getBaseUrl()}/${selectedValue}/search/${encodeURIComponent(query)}/${page}/`;
                    } else {
                        url = `${this.getBaseUrl()}/search/${encodeURIComponent(query)}/${selectedValue}/${page}/`;
                    }
                }
            } else if (filter.type_name === "GroupFilter" && filter.name === "Categories") {
                const selectedCategories = filter.state.filter(cb => cb.state).map(cb => cb.value);
                if (selectedCategories.length > 0) {
                    url = `${this.getBaseUrl()}/${selectedCategories[0]}/search/${encodeURIComponent(query)}/${page}/`;
                }
            }
        }

        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const list = [];
        const vidResultsContainer = doc.selectFirst("div#vidresults");
        if (!vidResultsContainer) {
            console.error("Could not find #vidresults container for search results.");
            return { list: [], hasNextPage: false };
        }
        const items = vidResultsContainer.select("div.mbimg");

        for (const item of items) {
            list.push(this._toMedia(item));
        }

        const hasNextPage = list.length > 0;
        return {
            list,
            hasNextPage
        };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const name = doc.selectFirst("meta[property=og:title]")?.attr("content")?.trim() || "Unknown Title";
        const imageUrl = doc.selectFirst("[property='og:image']")?.attr("content")?.trim() || "";
        const videoDescription = doc.selectFirst("div.video-description")?.text?.trim();
        const pageDescription = doc.selectFirst("meta[property=og:description]")?.attr("content")?.trim();
        const durationText = doc.selectFirst("span.vid-length")?.text?.trim() || "";

        let description = videoDescription || pageDescription || "No description available.";
        if (pageDescription && pageDescription.includes("Eporner is the largest hd porn source.")) {
            description = pageDescription.replace(" Eporner is the largest hd porn source.", "");
        }
        if (videoDescription && description !== videoDescription) {
             description = `${videoDescription}. ${description}`;
        }
        if (pageDescription && pageDescription.includes("Available in")) {
            const qualitiesInfo = pageDescription.substring(pageDescription.indexOf("Available in"));
            description = `${description}. ${qualitiesInfo}`;
        }

        const status = 1;

        const genre = [];
        const genreElements = doc.select("div#video-info-tags ul li.vit-category a");
        for (const element of genreElements) {
            const genreName = element.text?.trim();
            if (genreName) {
                genre.push(genreName);
            }
        }

        const chapters = [{
            name: "Video",
            url: url,
            dateUpload: new Date().valueOf().toString(),
            scanlator: ""
        }];

        return {
            name,
            imageUrl,
            description,
            link: url,
            status,
            genre,
            chapters,
        };
    }

    async getVideoList(url) {
        let streams = [];

        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const downloadDiv = doc.selectFirst("div#downloaddiv");
        if (!downloadDiv) {
            // Fallback to previous XHR method if downloadDiv is not found
            const videoIdMatch = url.match(/\/video\/([a-zA-Z0-9]+)\//);
            if (!videoIdMatch || !videoIdMatch[1]) {
                console.error("Could not extract video ID from URL for fallback:", url);
                return [];
            }
            const videoId = videoIdMatch[1];
            const xhrUrl = `${this.getBaseUrl()}/xhr/video/${videoId}`;
            const xhrRes = await this.client.get(xhrUrl, this.getHeaders(xhrUrl));

            try {
                const json = JSON.parse(xhrRes.body);
                const sources = json.sources;
                if (sources && sources.mp4) {
                    const mp4Sources = sources.mp4;
                    for (const qualityKey in mp4Sources) {
                        if (mp4Sources.hasOwnProperty(qualityKey)) {
                            const sourceObject = mp4Sources[qualityKey];
                            const src = sourceObject.src;
                            const labelShort = sourceObject.labelShort || qualityKey;

                            // XHR response doesn't typically provide file size easily, so we can't add it here.
                            streams.push({
                                url: src,
                                originalUrl: src,
                                quality: labelShort,
                                headers: this.getHeaders(src)
                            });
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to parse video sources JSON via fallback or extract sources:", e);
            }
        } else {
            const downloadLinks = downloadDiv.select("a[href*='/dload/']");

            for (const linkElement of downloadLinks) {
                const videoUrl = this.getBaseUrl() + linkElement.getHref;
                const fullQualityText = linkElement.text?.trim() || ""; // e.g., "Download MP4 (240p, AV1, 24.21 MB)"

                let quality = "Unknown";
                let codec = "";
                let fileSize = ""; // New variable for file size

                const qualityMatch = fullQualityText.match(/\(([^)]+)\)/); // Matches content inside first parentheses

                if (qualityMatch && qualityMatch[1]) {
                    const parts = qualityMatch[1].split(',').map(p => p.trim());
                    quality = parts[0] || "Unknown"; // e.g., "240p"
                    codec = parts[1] ? parts[1].toLowerCase() : ""; // e.g., "av1"
                    fileSize = parts[2] || ""; // e.g., "24.21 MB"
                }

                let finalQuality = quality;
                if (codec) {
                    finalQuality = `${quality} (${codec})`;
                }
                if (fileSize) {
                    finalQuality = `${finalQuality} - ${fileSize}`; // Append file size
                }

                streams.push({
                    url: videoUrl,
                    originalUrl: videoUrl,
                    quality: finalQuality,
                    headers: this.getHeaders(videoUrl)
                });
            }
        }

        streams.sort((a, b) => this.getQualityIndex(b.quality) - this.getQualityIndex(a.quality));

        const preferredQualityValue = this.getPreference("preferred_quality");

        if (preferredQualityValue !== "auto" && streams.length > 0) {
            const [prefResRaw, prefCodec] = preferredQualityValue.split('_'); // e.g., ["1080", "av1"]
            const prefResNum = parseInt(prefResRaw);

            let preferredStreamIndex = -1;

            // First, try to find an exact match (resolution AND codec)
            preferredStreamIndex = streams.findIndex(stream => {
                const { resolution, codec } = this._parseStreamQuality(stream.quality);
                return resolution && parseInt(resolution) === prefResNum && codec === prefCodec;
            });

            // If no exact match, try to find a match by resolution only (any codec)
            if (preferredStreamIndex === -1) {
                preferredStreamIndex = streams.findIndex(stream => {
                    const { resolution } = this._parseStreamQuality(stream.quality);
                    return resolution && parseInt(resolution) === prefResNum;
                });
            }

            if (preferredStreamIndex !== -1) {
                const preferredStream = streams.splice(preferredStreamIndex, 1)[0];
                streams.unshift(preferredStream);
            }
        }

        return streams;
    }

    getFilterList() {
        return [{
            type_name: "HeaderFilter",
            name: "Sort & Category Filters",
        }, {
            type_name: "SelectFilter",
            name: "Sort By",
            state: 0,
            values: [{
                type_name: "SelectOption",
                name: "Relevance (Search)",
                value: "search",
            }, {
                type_name: "SelectOption",
                name: "Best Videos",
                value: "best-videos"
            }, {
                type_name: "SelectOption",
                name: "Top Rated",
                value: "top-rated"
            }, {
                type_name: "SelectOption",
                name: "Most Viewed",
                value: "most-viewed"
            }]
        }, {
            type_name: "GroupFilter",
            name: "Categories",
            state: [{
                type_name: "CheckBox",
                name: "HD 1080p",
                value: "cat/hd-1080p"
            }, {
                type_name: "CheckBox",
                name: "4K Porn",
                value: "cat/4k-porn"
            }, {
                type_name: "CheckBox",
                name: "60 FPS",
                value: "cat/60fps"
            }, {
                type_name: "CheckBox",
                name: "Anal",
                value: "cat/anal"
            }, {
                type_name: "CheckBox",
                name: "Asian",
                value: "cat/asian"
            }, {
                type_name: "CheckBox",
                name: "Big Tits",
                value: "cat/big-tits"
            }, {
                type_name: "CheckBox",
                name: "Brazzers",
                value: "cat/brazzers"
            }, {
                type_name: "CheckBox",
                name: "Creampie",
                value: "cat/creampie"
            }]
        }];
    }

    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "Use a different mirror/domain for Eporner (e.g., https://www.eporner.com)",
                value: this.source.baseUrl,
                dialogTitle: "Enter new Base URL",
                dialogMessage: "Example: https://www.eporner.com",
            }
        }, {
            key: "preferred_quality",
            listPreference: {
                title: "Preferred Video Quality",
                summary: "Select the quality to be prioritized",
                valueIndex: 0,
                entries: [
                    "Auto",
                    "2160p (AV1)", "2160p (h264)",
                    "1440p (AV1)", "1440p (h264)",
                    "1080p (AV1)", "1080p (h264)",
                    "720p (AV1)", "720p (h264)",
                    "480p (AV1)", "480p (h264)",
                    "360p (AV1)", "360p (h264)",
                    "240p (AV1)", "240p (h264)"
                ],
                entryValues: [
                    "auto",
                    "2160_av1", "2160_h264",
                    "1440_av1", "1440_h264",
                    "1080_av1", "1080_h264",
                    "720_av1", "720_h264",
                    "480_av1", "480_h264",
                    "360_av1", "360_h264",
                    "240_av1", "240_h264"
                ],
            }
        }, {
            key: "enable_vpn_warning",
            switchPreferenceCompat: {
                title: "Show VPN warning",
                summary: "Display a warning if a VPN might be needed for this source.",
                value: true,
            }
        }];
    }
}
