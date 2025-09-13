const mangayomiSources = [{
    "name": "HentaiHaven",
    "id": 169691022124,
    "lang": "en",
    "baseUrl": "https://hentaihaven.xxx",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hentaihaven.xxx",
    "typeSource": "single",
    "isNsfw": true,
    "itemType": 1,
    "version": "3.0.1",
    "pkgPath": "anime/src/en/hentaihaven.js"
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
            ? `${this.getBaseUrl()}/?m_orderby=views`
            : `${this.getBaseUrl()}/page/${page}/?m_orderby=views`;
        return this.parseDirectory(url);
    }
    
    async getLatestUpdates(page) {
        const url = page === 1
            ? `${this.getBaseUrl()}/?m_orderby=new-manga`
            : `${this.getBaseUrl()}/page/${page}/?m_orderby=new-manga`;
        return this.parseDirectory(url);
    }

    async search(query, page, filters) {
        const baseUrl = this.getBaseUrl();
        const sortFilter = filters.find(f => f.name === "Sort by");
        const sortValue = sortFilter ? sortFilter.values[sortFilter.state].value : "";
        
        let path;
        const params = [];

        if (query) {
            path = page > 1 ? `/page/${page}/` : `/`;
            params.push(`s=${encodeURIComponent(query)}`);
            params.push(`post_type=wp-manga`);
        } else {
            const genreFilter = filters.find(f => f.name === "Genre (Series)");
            const tagFilter = filters.find(f => f.name === "Tag");

            let filterPath = "/";
            if (genreFilter && genreFilter.state > 0) {
                const genreValue = genreFilter.values[genreFilter.state].value;
                filterPath = `/series/${genreValue}/`;
            } else if (tagFilter && tagFilter.state > 0) {
                const tagValue = tagFilter.values[tagFilter.state].value;
                filterPath = `/tag/${tagValue}/`;
            }
            
            path = page > 1 ? `${filterPath}page/${page}/` : filterPath;
        }

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
        
        // Try selector for browse/filter pages first
        let items = doc.select("div.page-item-detail");

        if (items.length > 0) {
            // Logic for Browse/Filter pages
            for (const item of items) {
                const nameElement = item.selectFirst("h3.h5 a");
                if (!nameElement) continue;

                const name = nameElement.text.trim();
                const link = nameElement.getHref;
                const imageUrl = item.selectFirst("div.item-thumb img")?.getSrc;

                if (name && link && imageUrl) {
                    list.push({ name, imageUrl, link });
                }
            }
        } else {
            // Fallback for Search results page
            items = doc.select("div.c-tabs-item__content");
            for (const item of items) {
                const a = item.selectFirst("div.tab-thumb a");
                if (!a) continue;

                const name = a.attr("title").trim();
                const link = a.getHref;
                const imageUrl = a.selectFirst("img")?.getSrc;
                
                if (name && link && imageUrl) {
                    list.push({ name, imageUrl, link });
                }
            }
        }
        
        // Robust "next page" check for both layouts
        const hasNextPage = doc.selectFirst("a.nextpostslink, a.next.page-numbers") != null;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        const name = doc.selectFirst("div.post-title h1").text.trim();
        const imageUrl = doc.selectFirst("div.summary_image img")?.getSrc;
        const description = doc.selectFirst("div.summary__content")?.text?.trim() ?? "";
        const link = url;
        const status = 1; // Completed

        const genre = [];
        const genreElements = doc.select("div.genres-content a, div#init-links a.tag_btn");
        for (const element of genreElements) {
            genre.push(element.text.trim());
        }

        const chapters = [];
        const episodeElements = doc.select("li.wp-manga-chapter");
        for (const element of episodeElements) {
            const a = element.selectFirst("a");
            if (!a) continue;
            
            const dateSpanText = element.selectFirst("span.chapter-release-date")?.text ?? "";
            const epName = a.text.replace(dateSpanText, "").trim();
            const epUrl = a.getHref;
            chapters.push({ name: epName, url: epUrl });
        }
        
        chapters.reverse();

        if (chapters.length === 0) {
            chapters.push({ name: "Watch", url: url });
        }

        return { name, imageUrl, description, link, status, genre, chapters };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const thumbnailUrl = doc.selectFirst('meta[itemprop="thumbnailUrl"]')?.attr("content");
        if (!thumbnailUrl) return [];
        
        const pathParts = thumbnailUrl.split('/');
        if (pathParts.length < 2) return [];
        
        const identifier = pathParts[pathParts.length - 2];
        if (!identifier) return [];

        const masterPlaylistUrl = `https://master-lengs.org/api/v3/hh/${identifier}/master.m3u8`;
        
        if (this.getPreference("iptv_extract_qualities") && masterPlaylistUrl.toLowerCase().includes('.m3u8')) {
            try {
                const masterPlaylistContent = (await this.client.get(masterPlaylistUrl, this.getHeaders(masterPlaylistUrl))).body;
                const regex = /#EXT-X-STREAM-INF:.*(?:RESOLUTION=(\d+x\d+)|BANDWIDTH=(\d+)).*\n(?!#)(.+)/g;
                let match;
                const parsedQualities = [];
                const baseUrl = masterPlaylistUrl.substring(0, masterPlaylistUrl.lastIndexOf('/') + 1);
                while ((match = regex.exec(masterPlaylistContent)) !== null) {
                    const resolution = match[1];
                    const bandwidth = match[2];
                    let qualityName = resolution ? `${resolution.split('x')[1]}p` : `${Math.round(parseInt(bandwidth) / 1000)}kbps`;
                    let streamUrl = match[3].trim();
                    if (!streamUrl.startsWith('http')) streamUrl = baseUrl + streamUrl;
                    parsedQualities.push({ url: streamUrl, originalUrl: streamUrl, quality: qualityName, headers: this.getHeaders(streamUrl) });
                }

                if (parsedQualities.length > 0) {
                    parsedQualities.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
                    
                    const preferredQuality = this.getPreference("preferred_quality");
                    if (preferredQuality !== "ask") {
                        let targetStream;
                        if (preferredQuality === "best") {
                            // Already sorted
                        } else if (preferredQuality === "worst") {
                            targetStream = parsedQualities[parsedQualities.length - 1];
                        } else {
                            targetStream = parsedQualities.find(q => q.quality.includes(preferredQuality));
                            if (!targetStream) {
                                const preferredNum = parseInt(preferredQuality);
                                targetStream = parsedQualities.find(q => parseInt(q.quality) <= preferredNum);
                            }
                        }

                        if (targetStream) {
                            const index = parsedQualities.indexOf(targetStream);
                            if (index > 0) {
                                const [item] = parsedQualities.splice(index, 1);
                                parsedQualities.unshift(item);
                            }
                        }
                    }

                    const finalStreams = [...parsedQualities];
                    finalStreams.push({ url: masterPlaylistUrl, originalUrl: masterPlaylistUrl, quality: `Auto (HLS)`, headers: this.getHeaders(masterPlaylistUrl) });
                    return finalStreams;
                }
            } catch (e) { /* Fall through */ }
        }
        
        return [{ url: masterPlaylistUrl, originalUrl: masterPlaylistUrl, quality: "Default", headers: this.getHeaders(masterPlaylistUrl) }];
    }

    getFilterList() {
        const sortOptions = [
            { name: "Default", value: "" }, { name: "Latest", value: "latest" },
            { name: "A-Z", value: "alphabet" }, { name: "Rating", value: "rating" },
            { name: "Trending", value: "trending" }, { name: "Views", value: "views" },
            { name: "New", value: "new-manga" },
        ];
        
        const genres = [
            { name: '3D Hentai', value: '3d-hentai' }, { name: 'Anal', value: 'anal' }, { name: 'BBW', value: 'bbw' },
            { name: 'BDSM', value: 'bdsm' }, { name: 'Ecchi', value: 'ecchi' }, { name: 'FemBoy', value: 'femboy' },
            { name: 'Femdom', value: 'femdom' }, { name: 'Furry', value: 'furry' }, { name: 'Futanari', value: 'futanari' },
            { name: 'Gender Bender Hentai', value: 'gender-bender-hentai' }, { name: 'Harem', value: 'harem' },
            { name: 'Hentai School', value: 'hentai-school' }, { name: 'Horror', value: 'horror' },
            { name: 'Incest Hentai', value: 'incest' }, { name: 'Milf', value: 'milf' }, { name: 'Monster', value: 'monster' },
            { name: 'Romance', value: 'romance' }, { name: 'Softcore', value: 'softcore' },
            { name: 'Teen Hentai', value: 'teen-hentai' }, { name: 'Tentacle', value: 'tentacle' },
            { name: 'Tsundere', value: 'tsundere' }, { name: 'Umemaro 3D', value: 'umemaro-3d' },
            { name: 'Uncensored Hentai', value: 'uncensored' }, { name: 'Yaoi', value: 'yaoi' },
            { name: 'Young Hentai', value: 'young' }, { name: 'Yuri', value: 'yuri' }
        ];

        const tags = [
            { name: 'Anime Hentai', value: 'anime-hentai' }, { name: 'Anime Porn', value: 'anime-porn' },
            { name: 'Big Boobs', value: 'big-boobs' }, { name: 'Big Tits Hentai', value: 'big-tits' },
            { name: 'Blow Job', value: 'blow-job' }, { name: 'Censored', value: 'censored' },
            { name: 'Creampie', value: 'creampie' }, { name: 'Cum in Pussy', value: 'cum-in-pussy' },
            { name: 'eHentai', value: 'ehentai' }, { name: 'e Hentai', value: 'e-hentai' },
            { name: 'Free Hentai', value: 'free-hentai' }, { name: 'ge Hentai', value: 'ge-hentai' },
            { name: 'Gelbooru', value: 'gelbooru' }, { name: 'Hanime', value: 'hanime' }, { name: 'Hanime TV', value: 'hanime-tv' },
            { name: 'HD', value: 'hd' }, { name: 'Hentai', value: 'hentai' }, { name: 'Hentai Anime', value: 'hentai-anime' },
            { name: 'Hentai Chan', value: 'hentai-chan' }, { name: 'HentaiCity', value: 'hentaicity' },
            { name: 'HentaiCore', value: 'hentaicore' }, { name: 'HentaiDude', value: 'hentaidude' },
            { name: 'Hentai Foundry', value: 'hentai-foundry' }, { name: 'HentaiFreak', value: 'hentaifreak' },
            { name: 'Hentai Haven', value: 'hentai-haven' }, { name: 'Hentai Manga', value: 'hentai-manga' },
            { name: 'Hentai Porn', value: 'hentai-porn' }, { name: 'Hentai Stream', value: 'hentai-stream' },
            { name: 'Hentai TV', value: 'hentai-tv' }, { name: 'Hentai Vid', value: 'hentai-vid' },
            { name: 'Hentai Video', value: 'hentai-video' }, { name: 'Hentai Videos', value: 'hentai-videos' },
            { name: 'Masturbation', value: 'masturbation' }, { name: 'mp4Hentai', value: 'mp4hentai' },
            { name: 'Naughty Hentai', value: 'naughty-hentai' }, { name: 'nHentai', value: 'n-hentai' },
            { name: 'oHentai', value: 'ohentai' }, { name: 'Oral Sex', value: 'oral-sex' }, { name: 'Orgasm', value: 'orgasm' },
            { name: 'Rule 34', value: 'rule-34' }, { name: 'Sexy', value: 'sexy' }, { name: 'Tits', value: 'tits' },
            { name: 'Watch Hentai', value: 'watch-hentai' }, { name: 'xAnimePorn', value: 'xanimeporn' },
            { name: 'xHentai', value: 'xhentai' }
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
                    value: this.source.baseUrl,
                    dialogTitle: "Enter new Base URL",
                    dialogMessage: "",
                }
            }
        ];
    }
}