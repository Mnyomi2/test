const mangayomiSources = [{
    "name": "AniHentai",
    "id": 16965684124,
    "lang": "en",
    "baseUrl": "https://anihentai.com",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=anihentai.com", 
    "typeSource": "single",
    "isNsfw": true,
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/anihentai.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get supportsLatest() {
        return this.getPreference("enable_latest_tab");
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }
    
    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl(),
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }

    async getPopular(page) {
        // Updated URL structure for AniHentai popular/trending
        const url = page === 1 
            ? `${this.getBaseUrl()}/trending/`
            : `${this.getBaseUrl()}/trending/page/${page}/`;
        return this.parseDirectory(url);
    }
    
    async getLatestUpdates(page) {
        // Updated URL structure for AniHentai latest episodes
        const url = page === 1
            ? `${this.getBaseUrl()}/episodes/`
            : `${this.getBaseUrl()}/episodes/page/${page}/`;
        return this.parseDirectory(url);
    }

    async search(query, page, filters) {
        const baseUrl = this.getBaseUrl();
        const sortFilter = filters.find(f => f.name === "Sort by");
        const sortValue = sortFilter ? sortFilter.values[sortFilter.state].value : "";
        
        let path;
        const params = [];

        if (query) {
            // For text search, AniHentai uses standard WordPress 's' parameter
            path = `/`; 
            params.push(`s=${encodeURIComponent(query)}`);
            // Removing `post_type=wp-manga` as it might not be relevant for AniHentai's search
        } else {
            const genreFilter = filters.find(f => f.name === "Genre (Series)");
            const tagFilter = filters.find(f => f.name === "Tag");

            let filterPath = "/";
            if (genreFilter && genreFilter.state > 0) {
                const genreValue = genreFilter.values[genreFilter.state].value;
                filterPath = `/genre/${genreValue}/`; // AniHentai uses /genre/ for genre filters
            } else if (tagFilter && tagFilter.state > 0) {
                const tagValue = tagFilter.values[tagFilter.state].value;
                filterPath = `/tag/${tagValue}/`;
            }
            
            path = page > 1 ? `${filterPath}page/${page}/` : filterPath;
        }

        // Keep sortValue for filters, assuming the site supports it on filter pages
        if (sortValue) {
            params.push(`m_orderby=${sortValue}`);
        }
        
        let finalUrl = `${baseUrl}${path}`;
        if (params.length > 0) {
            finalUrl += `?${params.join('&')}`;
        }
        
        return this.parseDirectory(finalUrl);
    }

    async parseDirectory(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = [];
        
        // All list items are within div.poster
        const items = doc.select("div.poster");

        for (const item of items) {
            const imgElement = item.selectFirst("img");
            if (!imgElement) continue;

            const name = imgElement.attr("alt")?.trim() ?? "";
            const imageUrl = imgElement.getSrc;
            
            let link = "";
            
            // AniHentai uses different structures for links depending on the page type
            // Try to find the link for latest episodes (nested inside div.season_m)
            let linkElement = item.selectFirst("div.season_m a");
            if (linkElement) {
                link = linkElement.getHref;
            } else {
                // If not found, try the link for popular/trending (direct 'a' that contains 'div.see play4')
                linkElement = item.selectFirst("a[href] div.see.play4")?.parent; // Get the parent 'a' tag
                if (linkElement) {
                    link = linkElement.getHref;
                }
            }

            if (name && link && imageUrl) {
                list.push({ name, imageUrl, link });
            }
        }
        
        // Next page selector for AniHentai
        const hasNextPage = doc.selectFirst("a.arrow_pag") != null;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        // Updated selectors for AniHentai
        const name = doc.selectFirst("div.sheader h1")?.text?.trim() ?? "";
        const imageUrl = doc.selectFirst("div.sheader div.poster img")?.getSrc;
        const description = doc.selectFirst("div#info div.wp-content p")?.text?.trim() ?? "";
        const link = url;
        const status = 1; // Assuming 'Completed' for anime hentai videos

        const genre = [];
        const genreElements = doc.select("div.sgeneros a"); // Updated selector
        for (const element of genreElements) {
            genre.push(element.text.trim());
        }

        const chapters = [];
        // Episode list for AniHentai
        const episodeElements = doc.select("ul.episodios li"); // Updated selector
        for (const element of episodeElements) {
            const a = element.selectFirst("div.episodiotitle a"); // Updated selector
            if (!a) continue;
            
            const epName = a.text.trim(); // The date is in a separate span, so 'a.text' is clean
            const epUrl = a.getHref;
            chapters.push({ name: epName, url: epUrl });
        }
        
        chapters.reverse(); // Episodes are usually listed oldest first, reverse to get latest first.

        if (chapters.length === 0) {
            // If no explicit chapters, use the main page as a 'Watch' entry
            chapters.push({ name: "Watch", url: url });
        }

        return { name, imageUrl, description, link, status, genre, chapters };
    }

    async getVideoList(url) {
        // Step 1: Fetch the chapter/episode detail page
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        // Step 2: Extract the iframe src from the player container
        const iframeSrc = doc.selectFirst("div#source-player-1 iframe.metaframe.rptss")?.getSrc;
        
        if (!iframeSrc) {
            return []; // No video iframe found
        }

        // Step 3: Fetch the content of the iframe URL (this is where the actual video source is defined)
        const iframeRes = await this.client.get(iframeSrc, this.getHeaders(iframeSrc));
        const iframeBody = iframeRes.body;

        const videoList = [];
        const subtitleTracks = [];

        // Regex to find the video file and subtitle files from the JWPlayer setup script
        const videoFileRegex = /file:\s*"(https?:\/\/[^"]+\.(mp4|m3u8)(?:\?[^"]*)?)",\s*type:\s*"video\/mp4"/;
        const subtitleRegex = /"kind":\s*"captions",\s*"file":\s*"(https?:\/\/[^"]+\.srt)",\s*"label":\s*"([^"]+)"/g;

        const videoMatch = iframeBody.match(videoFileRegex);
        if (videoMatch && videoMatch[1]) {
            const videoUrl = videoMatch[1];
            
            // Extract subtitles if available
            let subMatch;
            while ((subMatch = subtitleRegex.exec(iframeBody)) !== null) {
                const subUrl = subMatch[1];
                const subLabel = subMatch[2];
                subtitleTracks.push({ url: subUrl, name: subLabel });
            }

            // Handle HLS qualities if enabled and the video URL is an M3U8 playlist
            if (this.getPreference("iptv_extract_qualities") && videoUrl.toLowerCase().includes('.m3u8')) {
                try {
                    const masterPlaylistContent = (await this.client.get(videoUrl, this.getHeaders(videoUrl))).body;
                    const regex = /#EXT-X-STREAM-INF:.*(?:RESOLUTION=(\d+x\d+)|BANDWIDTH=(\d+)).*\n(?!#)(.+)/g;
                    let match;
                    const parsedQualities = [];
                    const baseUrl = videoUrl.substring(0, videoUrl.lastIndexOf('/') + 1);
                    while ((match = regex.exec(masterPlaylistContent)) !== null) {
                        const resolution = match[1];
                        const bandwidth = match[2];
                        let qualityName = resolution ? `${resolution.split('x')[1]}p` : `${Math.round(parseInt(bandwidth) / 1000)}kbps`;
                        let streamUrl = match[3].trim();
                        if (!streamUrl.startsWith('http')) streamUrl = baseUrl + streamUrl; // Resolve relative URLs
                        parsedQualities.push({ url: streamUrl, originalUrl: streamUrl, quality: qualityName, headers: this.getHeaders(streamUrl), subtitleTracks: subtitleTracks });
                    }

                    if (parsedQualities.length > 0) {
                        // Sort by quality (highest resolution first)
                        parsedQualities.sort((a, b) => {
                            const qA = parseInt(a.quality);
                            const qB = parseInt(b.quality);
                            if (!isNaN(qA) && !isNaN(qB)) return qB - qA;
                            return 0; 
                        });
                        
                        // Apply preferred quality setting
                        const preferredQuality = this.getPreference("preferred_quality");
                        if (preferredQuality !== "ask") {
                            let targetStream;
                            if (preferredQuality === "best") {
                                targetStream = parsedQualities[0];
                            } else if (preferredQuality === "worst") {
                                targetStream = parsedQualities[parsedQualities.length - 1];
                            } else {
                                targetStream = parsedQualities.find(q => q.quality.includes(preferredQuality));
                                if (!targetStream) {
                                    const preferredNum = parseInt(preferredQuality);
                                    targetStream = parsedQualities.find(q => parseInt(q.quality) <= preferredNum);
                                }
                            }

                            if (targetStream && parsedQualities.indexOf(targetStream) > 0) {
                                const index = parsedQualities.indexOf(targetStream);
                                const [item] = parsedQualities.splice(index, 1);
                                parsedQualities.unshift(item); // Move preferred stream to the front
                            }
                        }
                        videoList.push(...parsedQualities);
                        // Add an "Auto" option for HLS playback
                        videoList.push({ url: videoUrl, originalUrl: videoUrl, quality: `Auto (HLS)`, headers: this.getHeaders(videoUrl), subtitleTracks: subtitleTracks });
                    }
                } catch (e) { /* Fall through to default if HLS extraction fails */ }
            }
            
            // If no HLS qualities extracted or it's a direct MP4, add the default/main video.
            if (videoList.length === 0) {
                videoList.push({ url: videoUrl, originalUrl: videoUrl, quality: "Default", headers: this.getHeaders(videoUrl), subtitleTracks: subtitleTracks });
            }
        }
        
        return videoList;
    }

    getFilterList() {
        const sortOptions = [
            { name: "Default", value: "" }, 
            { name: "Latest", value: "latest" },
            { name: "A-Z", value: "alphabet" }, 
            { name: "Rating", value: "rating" },
            { name: "Trending", value: "trending" }, 
            { name: "Views", value: "views" },
            { name: "New", value: "new-manga" }, // Retaining this sort option, common in WordPress themes
        ];
        
        // Updated genre and tag lists based on AniHentai's website (as of current check)
        const genres = [
            { name: '3D Hentai', value: '3d-hentai' },
            { name: 'Anal', value: 'anal' },
            { name: 'Big Boobs', value: 'big-boobs' },
            { name: 'Blow Job', value: 'blow-job' },
            { name: 'Censored', value: 'censored' },
            { name: 'Cheating', value: 'cheating' },
            { name: 'Creampie', value: 'creampie' },
            { name: 'Ecchi', value: 'ecchi' },
            { name: 'Futanari', value: 'futanari' },
            { name: 'Harem', value: 'harem' },
            { name: 'Incest', value: 'incest' },
            { name: 'Loli', value: 'loli' },
            { name: 'Masturbation', value: 'masturbation' },
            { name: 'Milf', value: 'milf' },
            { name: 'Monster', value: 'monster' },
            { name: 'Netorare', value: 'netorare' },
            { name: 'Ntr', value: 'ntr' },
            { name: 'Rape', value: 'rape' },
            { name: 'Romance', value: 'romance' },
            { name: 'School Girl', value: 'school-girl' },
            { name: 'Shotacon', value: 'shotacon' },
            { name: 'Tentacle', value: 'tentacle' },
            { name: 'Threesome', value: 'threesome' },
            { name: 'Uncensored', value: 'uncensored' },
            { name: 'Virtual Reality', value: 'virtual-reality' },
            { name: 'Yaoi', value: 'yaoi' },
            { name: 'Yuri', value: 'yuri' }
        ];

        const tags = [
            { name: '1080P', value: '1080p' },
            { name: 'Anime', value: 'anime' },
            { name: 'Anime Hentai', value: 'anime-hentai' },
            { name: 'Anime Porn', value: 'anime-porn' },
            { name: 'Big Tits', value: 'big-tits' },
            { name: 'Cartoon Hentai', value: 'cartoon-hentai' },
            { name: 'Censored', value: 'censored' },
            { name: 'Cfnm', value: 'cfnm' },
            { name: 'Creampie', value: 'creampie' },
            { name: 'Dick', value: 'dick' },
            { name: 'Ecchi', value: 'ecchi' },
            { name: 'Erotic', value: 'erotic' },
            { name: 'Futanari', value: 'futanari' },
            { name: 'H Manga', value: 'h-manga' },
            { name: 'HD', value: 'hd' },
            { name: 'Hentai', value: 'hentai' },
            { name: 'Hentai Video', value: 'hentai-video' },
            { name: 'Hentaihaven', value: 'hentaihaven' },
            { name: 'Incest', value: 'incest' },
            { name: 'Japanese', value: 'japanese' },
            { name: 'Jkf', value: 'jkf' },
            { name: 'Lesbian', value: 'lesbian' },
            { name: 'Loli', value: 'loli' },
            { name: 'Manga', value: 'manga' },
            { name: 'Milf', value: 'milf' },
            { name: 'Mmf', value: 'mmf' },
            { name: 'Nsfw', value: 'nsfw' },
            { name: 'Nude', value: 'nude' },
            { name: 'Oral', value: 'oral' },
            { name: 'Orgasm', value: 'orgasm' },
            { name: 'Otaku', value: 'otaku' },
            { name: 'Porn', value: 'porn' },
            { name: 'Princess', value: 'princess' },
            { name: 'Pussy', value: 'pussy' },
            { name: 'Rape', value: 'rape' },
            { name: 'Rimming', value: 'rimming' },
            { name: 'Schoolgirl', value: 'schoolgirl' },
            { name: 'Sex', value: 'sex' },
            { name: 'Sexy', value: 'sexy' },
            { name: 'Shotacon', value: 'shotacon' },
            { name: 'Squirting', value: 'squirting' },
            { name: 'Teen', value: 'teen' },
            { name: 'Tentacle', value: 'tentacle' },
            { name: 'Tits', value: 'tits' },
            { name: 'Uncensored', value: 'uncensored' },
            { name: 'Vagina', value: 'vagina' },
            { name: 'Vaginal', value: 'vaginal' },
            { name: 'Video', value: 'video' },
            { name: 'Virgin', value: 'virgin' },
            { name: 'Virtual', value: 'virtual' },
            { name: 'Webm', value: 'webm' },
            { name: 'Xxx', value: 'xxx' },
            { name: 'Yaoi', value: 'yaoi' },
            { name: 'Young', value: 'young' },
            { name: 'Yuri', value: 'yuri' }
        ];

        const toOption = (item) => ({ type_name: "SelectOption", name: item.name, value: item.value });

        const genreOptions = [{ type_name: "SelectOption", name: "Any", value: "" }, ...genres.sort((a, b) => a.name.localeCompare(b.name)).map(toOption)];
        const tagOptions = [{ type_name: "SelectOption", name: "Any", value: "" }, ...tags.sort((a, b) => a.name.localeCompare(b.name)).map(toOption)];

        return [
            { type_name: "HeaderFilter", name: "NOTE: Text search overrides Genre/Tag filters." },
            { type_name: "HeaderFilter", name: "Only one category filter (Genre or Tag) can be used." },
            { 
                type_name: "SelectFilter", name: "Sort by", state: 0, 
                values: sortOptions.map(s => ({ type_name: "SelectOption", name: s.name, value: s.value })) 
            },
            { type_name: "SelectFilter", name: "Genre (Series)", state: 0, values: genreOptions },
            { type_name: "SelectFilter", name: "Tag", state: 0, values: tagOptions },
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "enable_latest_tab",
                switchPreferenceCompat: {
                    title: "Enable 'Latest' Tab",
                    summary: "Toggles the visibility of the 'Latest' tab for this source.",
                    value: true,
                }
            },
            {
                key: "iptv_extract_qualities",
                switchPreferenceCompat: {
                    title: "Enable Stream Quality Extraction",
                    summary: "If a video provides multiple qualities (HLS/M3U8), this will list them. May not work for all videos.",
                    value: true,
                }
            },
            {
                key: "preferred_quality",
                listPreference: {
                    title: "Preferred Quality",
                    summary: "Select the quality to play by default. All other qualities will still be available.",
                    entries: ["Best", "Worst", "1080p", "720p", "480p", "Ask"],
                    entryValues: ["best", "worst", "1080", "720", "480", "ask"],
                    valueIndex: 0
                }
            },
            {
                key: "override_base_url",
                editTextPreference: {
                    title: "Override Base URL",
                    summary: "Use a different mirror/domain for the source",
                    value: this.source.baseUrl, // Default to the new AniHentai base URL
                    dialogTitle: "Enter new Base URL",
                    dialogMessage: "",
                }
            }
        ];
    }
}