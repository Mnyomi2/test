const mangayomiSources = [{
    "name": "WatchHentai",
    "id": 17195988188,
    "lang": "en",
    "baseUrl": "https://watchhentai.net",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=watchhentai.net",
    "typeSource": "single",
    "isNsfw": true,
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/watchhentai.js"
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
        const url = page === 1 
            ? `${this.getBaseUrl()}/trending/`
            : `${this.getBaseUrl()}/trending/page/${page}/`;
        return this.parseDirectory(url);
    }
    
    async getLatestUpdates(page) {
        const url = page === 1
            ? `${this.getBaseUrl()}/series/?orderby=latest`
            : `${this.getBaseUrl()}/series/page/${page}/?orderby=latest`;
        return this.parseDirectory(url);
    }

    async search(query, page, filters) {
        const baseUrl = this.getBaseUrl();
        const sortFilter = filters.find(f => f.name === "Sort by");
        const sortValue = sortFilter ? sortFilter.values[sortFilter.state].value : "";
        const genreFilter = filters.find(f => f.name === "Genre");
        const genreValue = genreFilter ? genreFilter.values[genreFilter.state].value : "";

        let url;
        const params = new URLSearchParams();

        if (query) {
            url = page > 1 ? `${baseUrl}/page/${page}/` : `${baseUrl}/`;
            params.set('s', query);
        } else if (genreValue) {
            url = `${baseUrl}/genre/${genreValue}/` + (page > 1 ? `page/${page}/` : '');
        } else {
            url = `${baseUrl}/series/` + (page > 1 ? `page/${page}/` : '');
        }

        if (sortValue) {
            params.set('orderby', sortValue);
        }
        
        const finalUrl = url + (params.toString() ? '?' + params.toString() : '');
        return this.parseDirectory(finalUrl);
    }

    async parseDirectory(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = [];
        
        const items = doc.select("article.item.tvshows");

        for (const item of items) {
            const a = item.selectFirst("div.data h3 a");
            if (!a) continue;

            const name = a.text.trim();
            const link = a.getHref;
            const img = item.selectFirst("div.poster img");
            const imageUrl = img?.attr("data-src") || img?.getSrc;

            if (name && link && imageUrl) {
                list.push({ name, imageUrl, link });
            }
        }
        
        const hasNextPage = doc.selectFirst("a.arrow_pag:has(i#nextpagination)") != null;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        const name = doc.selectFirst("div.data h1").text.trim();
        const imageUrl = doc.selectFirst("div.poster img")?.getSrc;
        const description = doc.selectFirst("div#description p")?.text?.trim() ?? "";
        const link = url;
        const status = 1; // Completed

        const genre = doc.select("div.sgeneros a").map(el => el.text.trim());

        const chapters = [];
        const episodeElements = doc.select("ul.episodios li");
        for (const element of episodeElements) {
            const a = element.selectFirst("a");
            if (!a) continue;
            
            const epName = element.selectFirst("h3").text.trim();
            const epUrl = a.getHref;
            chapters.push({ name: epName, url: epUrl });
        }
        
        chapters.reverse();

        return { name, imageUrl, description, link, status, genre, chapters };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const postIdMatch = doc.body.attr("class").match(/postid-(\d+)/);
        if (!postIdMatch) return [];

        const postId = postIdMatch[1];
        const servers = doc.select("li.dooplay_player_option");
        const videoList = [];

        for (const server of servers) {
            const serverName = server.text.trim();
            const nume = server.attr("data-nume");
            
            const ajaxUrl = `${this.getBaseUrl()}/wp-admin/admin-ajax.php`;
            const ajaxHeaders = {
                ...this.getHeaders(ajaxUrl),
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            };

            try {
                const ajaxRes = await this.client.post(ajaxUrl, { "action": `doo_player_ajax`, "post": postId, "nume": nume, "type": "movie" }, ajaxHeaders);
                const embedData = JSON.parse(ajaxRes.body);
                const embedUrlMatch = embedData.embed_url.match(/src="([^"]+)"/);
                
                if (embedUrlMatch) {
                    const embedUrl = embedUrlMatch[1];
                    // Example extractor for Vidmoly
                    if (embedUrl.includes("vidmoly")) {
                        const embedRes = await this.client.get(embedUrl, this.getHeaders(embedUrl));
                        const m3u8Match = embedRes.body.match(/file:"([^"]+\.m3u8)"/);
                        if (m3u8Match) {
                            const m3u8Url = m3u8Match[1];
                            const masterPlaylistVideos = await this.parseHls(m3u8Url, serverName);
                            videoList.push(...masterPlaylistVideos);
                        }
                    }
                }
            } catch (e) {
                // Ignore server if it fails
            }
        }

        return videoList;
    }

    async parseHls(masterPlaylistUrl, qualityPrefix) {
        const parsedQualities = [];
        try {
            if (this.getPreference("iptv_extract_qualities") && masterPlaylistUrl.toLowerCase().includes('.m3u8')) {
                const masterPlaylistContent = (await this.client.get(masterPlaylistUrl, this.getHeaders(masterPlaylistUrl))).body;
                const regex = /#EXT-X-STREAM-INF:.*(?:RESOLUTION=(\d+x\d+)|BANDWIDTH=(\d+)).*\n(?!#)(.+)/g;
                let match;
                const baseUrl = masterPlaylistUrl.substring(0, masterPlaylistUrl.lastIndexOf('/') + 1);
                
                while ((match = regex.exec(masterPlaylistContent)) !== null) {
                    const resolution = match[1];
                    const bandwidth = match[2];
                    let qualityName = resolution ? `${resolution.split('x')[1]}p` : `${Math.round(parseInt(bandwidth) / 1000)}kbps`;
                    if (qualityPrefix) qualityName = `${qualityPrefix}: ${qualityName}`;
                    let streamUrl = match[3].trim();
                    if (!streamUrl.startsWith('http')) streamUrl = baseUrl + streamUrl;
                    parsedQualities.push({ url: streamUrl, originalUrl: streamUrl, quality: qualityName, headers: this.getHeaders(streamUrl) });
                }

                if (parsedQualities.length > 0) {
                    parsedQualities.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
                    
                    const preferredQuality = this.getPreference("preferred_quality");
                    if (preferredQuality !== "ask") {
                        let targetStream = parsedQualities.find(q => q.quality.includes(preferredQuality)) ||
                                           parsedQualities.find(q => parseInt(q.quality) <= parseInt(preferredQuality));
                        
                        if (preferredQuality === "best") targetStream = parsedQualities[0];
                        if (preferredQuality === "worst") targetStream = parsedQualities[parsedQualities.length - 1];

                        if (targetStream) {
                            const index = parsedQualities.indexOf(targetStream);
                            if (index > 0) {
                                const [item] = parsedQualities.splice(index, 1);
                                parsedQualities.unshift(item);
                            }
                        }
                    }
                }
            }
        } catch (e) { /* Fall through */ }
        
        parsedQualities.push({ url: masterPlaylistUrl, originalUrl: masterPlaylistUrl, quality: `${qualityPrefix}: Auto (HLS)`, headers: this.getHeaders(masterPlaylistUrl) });
        return parsedQualities;
    }


    getFilterList() {
        const sortOptions = [
            { name: "Default", value: "" }, { name: "Latest", value: "latest" },
            { name: "Popular", value: "popular" }, { name: "Rating", value: "rating" },
            { name: "Title A-Z", value: "title_a-z" }, { name: "Title Z-A", value: "title_z-a" },
        ];
        
        const genres = [
            { name: '3D', value: '3d' }, { name: 'Action', value: 'action' }, { name: 'Ahegao', value: 'ahegao' },
            { name: 'Anal', value: 'anal' }, { name: 'Big Tits', value: 'big-tits' }, { name: 'Bondage', value: 'bondage' },
            { name: 'Bukkake', value: 'bukkake' }, { name: 'Cosplay', value: 'cosplay' }, { name: 'Creampie', value: 'creampie' },
            { name: 'Dark Skin', value: 'dark-skin' }, { name: 'Demons', value: 'demons' }, { name: 'Futanari', value: 'futanari' },
            { name: 'Gangbang', value: 'gangbang' }, { name: 'Glasses', value: 'glasses' }, { name: 'Harem', value: 'harem' },
            { name: 'Incest', value: 'incest' }, { name: 'Inflation', value: 'inflation' }, { name: 'Lactation', value: 'lactation' },
            { name: 'Loli', value: 'loli' }, { name: 'Masturbation', value: 'masturbation' }, { name: 'Milf', value: 'milf' },
            { name: 'Mind Break', value: 'mind-break' }, { name: 'Monster', value: 'monster' }, { name: 'Neko', value: 'neko' },
            { name: 'Netorare', value: 'netorare' }, { name: 'Paizuri', value: 'paizuri' }, { name: 'Rape', value: 'rape' },
            { name: 'Reverse Rape', value: 'reverse-rape' }, { name: 'School Girl', value: 'school-girl' }, { name: 'Scorn', value: 'scorn' },
            { name: 'Sex Toys', value: 'sex-toys' }, { name: 'Shotacon', value: 'shotacon' }, { name: 'Succubus', value: 'succubus' },
            { name: 'Tentacles', value: 'tentacles' }, { name: 'Threesome', value: 'threesome' }, { name: 'Trap', value: 'trap' },
            { name: 'Tsundere', value: 'tsundere' }, { name: 'Vanilla', value: 'vanilla' }, { name: 'X-Ray', value: 'x-ray' },
            { name: 'Yaoi', value: 'yaoi' }, { name: 'Yuri', value: 'yuri' }
        ];

        const toOption = (item) => ({ type_name: "SelectOption", name: item.name, value: item.value });

        const genreOptions = [{ type_name: "SelectOption", name: "Any", value: "" }, ...genres.sort((a, b) => a.name.localeCompare(b.name)).map(toOption)];

        return [
            { type_name: "HeaderFilter", name: "NOTE: Text search overrides Genre filter." },
            { 
                type_name: "SelectFilter", name: "Sort by", state: 0, 
                values: sortOptions.map(s => ({ type_name: "SelectOption", name: s.name, value: s.value })) 
            },
            { type_name: "SelectFilter", name: "Genre", state: 0, values: genreOptions },
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
                    value: this.source.baseUrl,
                    dialogTitle: "Enter new Base URL",
                    dialogMessage: "",
                }
            }
        ];
    }
}