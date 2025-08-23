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
        const codecMatch = qualityString.match(/\(([^)]+)\)/);

        const resolution = resMatch ? resMatch[1] : null;
        let codec = null;
        if (codecMatch && codecMatch[1]) {
            const parts = codecMatch[1].split(',').map(p => p.trim());
            if (parts.length >= 2) {
                codec = parts[0].toLowerCase();
            } else {
                codec = codecMatch[1].toLowerCase();
            }
        }

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

        let selectedCategoryValue = "";

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
            } else if (filter.type_name === "SelectFilter" && filter.name === "Category") {
                selectedCategoryValue = filter.values[filter.state].value;
                if (selectedCategoryValue && selectedCategoryValue !== "") { // If a specific category is selected (not "All" or "Any Category")
                    // Prepend category path to the URL if a category is selected and not already handled by sort
                    if (!url.includes("/cat/")) { // Avoid double category path
                        url = `${this.getBaseUrl()}/${selectedCategoryValue}/search/${encodeURIComponent(query)}/${page}/`;
                    }
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
                const fullQualityText = linkElement.text?.trim() || "";

                let quality = "Unknown";
                let codec = "";
                let fileSize = "";

                const qualityMatch = fullQualityText.match(/\(([^)]+)\)/);

                if (qualityMatch && qualityMatch[1]) {
                    const parts = qualityMatch[1].split(',').map(p => p.trim());
                    quality = parts[0] || "Unknown";
                    codec = parts[1] ? parts[1].toLowerCase() : "";
                    fileSize = parts[2] || "";
                }

                let finalQuality = quality;
                if (codec) {
                    finalQuality = `${quality} (${codec})`;
                }
                if (fileSize) {
                    finalQuality = `${finalQuality} - ${fileSize}`;
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
            const [prefResRaw, prefCodec] = preferredQualityValue.split('_');
            const prefResNum = parseInt(prefResRaw);

            let preferredStreamIndex = -1;

            preferredStreamIndex = streams.findIndex(stream => {
                const { resolution, codec } = this._parseStreamQuality(stream.quality);
                return resolution && parseInt(resolution) === prefResNum && codec === prefCodec;
            });

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
            type_name: "SelectFilter",
            name: "Category",
            state: 0,
            values: [
                { type_name: "SelectOption", name: "Any Category", value: "" },
                { type_name: "SelectOption", name: "All", value: "all" }, // Added 'All' as per your request
                { type_name: "SelectOption", name: "4K Ultra HD", value: "cat/4k-porn" },
                { type_name: "SelectOption", name: "60 FPS", value: "cat/60fps" },
                { type_name: "SelectOption", name: "Amateur", value: "cat/amateur" },
                { type_name: "SelectOption", name: "Anal", value: "cat/anal" },
                { type_name: "SelectOption", name: "Asian", value: "cat/asian" },
                { type_name: "SelectOption", name: "ASMR", value: "cat/asmr" },
                { type_name: "SelectOption", name: "BBW", value: "cat/bbw" },
                { type_name: "SelectOption", name: "BDSM", value: "cat/bdsm" },
                { type_name: "SelectOption", name: "Big Ass", value: "cat/big-ass" },
                { type_name: "SelectOption", name: "Big Dick", value: "cat/big-dick" },
                { type_name: "SelectOption", name: "Big Tits", value: "cat/big-tits" },
                { type_name: "SelectOption", name: "Bisexual", value: "cat/bisexual" },
                { type_name: "SelectOption", name: "Blonde", value: "cat/blonde" },
                { type_name: "SelectOption", name: "Blowjob", value: "cat/blowjob" },
                { type_name: "SelectOption", name: "Bondage", value: "cat/bondage" },
                { type_name: "SelectOption", name: "Brunette", value: "cat/brunette" },
                { type_name: "SelectOption", name: "Bukkake", value: "cat/bukkake" },
                { type_name: "SelectOption", name: "Creampie", value: "cat/creampie" },
                { type_name: "SelectOption", name: "Cumshot", value: "cat/cumshot" },
                { type_name: "SelectOption", name: "Double Penetration", value: "cat/double-penetration" },
                { type_name: "SelectOption", name: "Ebony", value: "cat/ebony" },
                { type_name: "SelectOption", name: "Fat", value: "cat/fat" },
                { type_name: "SelectOption", name: "Fetish", value: "cat/fetish" },
                { type_name: "SelectOption", name: "Fisting", value: "cat/fisting" },
                { type_name: "SelectOption", name: "Footjob", value: "cat/footjob" },
                { type_name: "SelectOption", name: "For Women", value: "cat/for-women" },
                { type_name: "SelectOption", name: "Gay", value: "cat/gay" },
                { type_name: "SelectOption", name: "Group Sex", value: "cat/group-sex" },
                { type_name: "SelectOption", name: "Handjob", value: "cat/handjob" },
                { type_name: "SelectOption", name: "Hardcore", value: "cat/hardcore" },
                { type_name: "SelectOption", name: "HD Porn 1080p", value: "cat/hd-1080p" },
                { type_name: "SelectOption", name: "HD Sex", value: "cat/hd-sex" },
                { type_name: "SelectOption", name: "Hentai", value: "cat/hentai" },
                { type_name: "SelectOption", name: "Homemade", value: "cat/homemade" },
                { type_name: "SelectOption", name: "Hotel", value: "cat/hotel" },
                { type_name: "SelectOption", name: "Housewives", value: "cat/housewives" },
                { type_name: "SelectOption", name: "HQ Porn", value: "cat/hq-porn" },
                { type_name: "SelectOption", name: "Indian", value: "cat/indian" },
                { type_name: "SelectOption", name: "Interracial", value: "cat/interracial" },
                { type_name: "SelectOption", name: "Japanese", value: "cat/japanese" },
                { type_name: "SelectOption", name: "Latina", value: "cat/latina" },
                { type_name: "SelectOption", name: "Lesbian", value: "cat/lesbians" }, // Note: value is 'lesbians'
                { type_name: "SelectOption", name: "Lingerie", value: "cat/lingerie" },
                { type_name: "SelectOption", name: "Massage", value: "cat/massage" },
                { type_name: "SelectOption", name: "Masturbation", value: "cat/masturbation" },
                { type_name: "SelectOption", name: "Mature", value: "cat/mature" },
                { type_name: "SelectOption", name: "MILF", value: "cat/milf" },
                { type_name: "SelectOption", name: "Nurses", value: "cat/nurse" },
                { type_name: "SelectOption", name: "Office", value: "cat/office" },
                { type_name: "SelectOption", name: "Older Men", value: "cat/old-man" },
                { type_name: "SelectOption", name: "Orgy", value: "cat/orgy" },
                { type_name: "SelectOption", name: "Outdoor", value: "cat/outdoor" },
                { type_name: "SelectOption", name: "Petite", value: "cat/petite" },
                { type_name: "SelectOption", name: "Pornstar", value: "cat/pornstar" },
                { type_name: "SelectOption", name: "POV", value: "cat/pov-porn" },
                { type_name: "SelectOption", name: "Public", value: "cat/public" },
                { type_name: "SelectOption", name: "Redhead", value: "cat/redhead" },
                { type_name: "SelectOption", name: "Shemale", value: "cat/shemale" },
                { type_name: "SelectOption", name: "Sleep", value: "cat/sleep" },
                { type_name: "SelectOption", name: "Small Tits", value: "cat/small-tits" },
                { type_name: "SelectOption", name: "Squirt", value: "cat/squirt" },
                { type_name: "SelectOption", name: "Striptease", value: "cat/striptease" },
                { type_name: "SelectOption", name: "Students", value: "cat/students" },
                { type_name: "SelectOption", name: "Swinger", value: "cat/swingers" },
                { type_name: "SelectOption", name: "Teen", value: "cat/teens" }, // Note: value is 'teens'
                { type_name: "SelectOption", name: "Threesome", value: "cat/threesome" },
                { type_name: "SelectOption", name: "Toys", value: "cat/toys" },
                { type_name: "SelectOption", name: "Uncategorized", value: "cat/uncategorized" },
                { type_name: "SelectOption", name: "Uniform", value: "cat/uniform" },
                { type_name: "SelectOption", name: "Vintage", value: "cat/vintage" },
                { type_name: "SelectOption", name: "VR Porn", value: "cat/vr-porn" },
                { type_name: "SelectOption", name: "Webcam", value: "cat/webcam" }
            ]
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
