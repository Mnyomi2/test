const mangayomiSources = [{
    "name": "WatchHentai",
    "id": 17195988188,
    "lang": "en",
    "baseUrl": "https://watchhentai.net",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://watchhentai.net",
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
            "User-Agent": "Mozilla/5.- (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
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
            ? `${this.getBaseUrl()}/videos/`
            : `${this.getBaseUrl()}/videos/page/${page}/`;
        return this.parseDirectory(url);
    }

    async search(query, page, filters) {
        const baseUrl = this.getBaseUrl();
        
        if (query) {
            let url = `${baseUrl}/`;
            if (page > 1) url += `page/${page}/`;
            const params = new URLSearchParams({ s: query });
            return this.parseDirectory(`${url}?${params}`);
        }

        const listingFilter = filters.find(f => f.name === "Content Type");
        const listingValue = listingFilter ? listingFilter.values[listingFilter.state].value : "series";

        let path;
        if (listingValue === "genre") {
            const genreFilter = filters.find(f => f.name === "Genre");
            const genreValue = genreFilter ? genreFilter.values[genreFilter.state].value : "";
            path = genreValue ? `/genre/${genreValue}/` : '/series/';
        } else if (listingValue === "year") {
            const yearFilter = filters.find(f => f.name === "Year");
            const yearValue = yearFilter ? yearFilter.values[yearFilter.state].value : "";
            path = yearValue ? `/release/${yearValue}/` : '/series/';
        } else {
            path = `/series/`;
        }

        let finalUrl = `${baseUrl}${path}`;
        if (page > 1) {
            finalUrl += `page/${page}/`;
        }
        
        return this.parseDirectory(finalUrl);
    }

    async parseDirectory(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = [];

        if (url.includes("/videos/")) { // Recent Episodes Parser
            doc.select("article.item.se.episodes").forEach(item => {
                const a = item.selectFirst("div.data a");
                if (a) {
                    const seriesName = a.selectFirst("strong > span.serie")?.text ?? '';
                    const episodeNum = a.selectFirst("h3")?.text ?? '';
                    const name = `${seriesName} - ${episodeNum}`.replace(/^- | -$/g, '').trim();
                    const link = a.getHref;
                    const img = item.selectFirst("div.poster img");
                    const imageUrl = img?.attr("data-src") || img?.getSrc;
                    if (name && link && imageUrl) list.push({ name, imageUrl, link });
                }
            });
        } else { // Series Parser
            doc.select("article.item.tvshows").forEach(item => {
                const a = item.selectFirst("div.data h3 a");
                if (a) {
                    const name = a.text.trim();
                    const link = a.getHref;
                    const img = item.selectFirst("div.poster img");
                    const imageUrl = img?.attr("data-src") || img?.getSrc;
                    if (name && link && imageUrl) list.push({ name, imageUrl, link });
                }
            });
        }
        
        const hasNextPage = doc.selectFirst("a.arrow_pag:has(i#nextpagination)") != null;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        if (url.includes("/videos/")) {
            const initialRes = await this.client.get(url, this.getHeaders(url));
            const initialDoc = new Document(initialRes.body);
            const seriesLinkElement = initialDoc.selectFirst("div.pag_episodes a:has(i.fa-bars), a.lnk-serie");
            if (seriesLinkElement) {
                url = seriesLinkElement.getHref;
            } else {
                return this.parseEpisodePageAsSeries(initialDoc, url);
            }
        }
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        return this.parseSeriesPage(doc, url);
    }

    parseSeriesPage(doc, url) {
        const name = doc.selectFirst("div.data h1").text.trim();
        const img = doc.selectFirst("div.poster img");
        const imageUrl = img?.attr("data-src") || img?.getSrc;
        
        let description = "";
        const synopsisPs = doc.select("div.sbox div.wp-content p"); // New layout
        if (synopsisPs.length > 0) {
            description = synopsisPs.map(p => p.text.trim()).join('\n\n');
        } else {
            description = doc.selectFirst("div#description p")?.text?.trim() ?? ""; // Old layout
        }
        
        const details = [];
        const censorship = doc.selectFirst("div.buttonuncensured, div.buttoncensured")?.text?.trim();
        if (censorship) details.push(`Censorship: ${censorship === 'UNC' ? 'Uncensored' : 'Censored'}`);

        const rating = doc.selectFirst("div.starstruck")?.attr("data-rating");
        if (rating) {
            let ratingText = `Rating: ${rating}/10`;
            const ratingCount = doc.selectFirst("span.rating-count")?.text;
            if (ratingCount) ratingText += ` (${ratingCount} votes)`;
            details.push(ratingText);
        }

        doc.select("div.sbox div.custom_fields").forEach(element => {
            const key = element.selectFirst("b.variante")?.text?.trim();
            const value = element.selectFirst("span.valor")?.text?.trim();
            if (key && value) details.push(`${key}: ${value}`);
        });

        if (details.length > 0) {
            description += `\n\n----\n${details.join('\n')}`;
        }
    
        const genre = doc.select("div.sgeneros a").map(el => el.text.trim());
        const chapters = doc.select("ul.episodios > li").map(element => {
            const a = element.selectFirst("div.episodiotitle a");
            return { name: a.text.trim(), url: a.getHref };
        }).reverse();
    
        return { name, imageUrl, description, link: url, status: 1, genre, chapters };
    }

    parseEpisodePageAsSeries(doc, url) {
        const headerText = doc.selectFirst("h3 > strong")?.text ?? "Episode";
        const name = headerText.replace(/episode\s*\d+/i, '').replace(/stream|english subbed/gi, '').trim();
        const imageUrl = doc.selectFirst('meta[itemprop="thumbnailUrl"]')?.attr("content");
        const description = doc.selectFirst("div.synopsis p")?.text?.replace("Synopsis:", "").trim() ?? "No description.";
        const genre = doc.select("nav.genres li a").map(el => el.text.trim());
        let chapters = doc.select("div#seasons ul.episodios > li").map(element => {
            const a = element.selectFirst("div.episodiotitle a");
            return { name: a.text.trim(), url: a.getHref };
        }).reverse();

        if (chapters.length === 0) chapters.push({ name: headerText, url: url });

        return { name, imageUrl, description, link: url, status: 1, genre, chapters };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        let videoList = [];

        const downloadPageLink = doc.selectFirst("a.download-video")?.getHref;
        if (downloadPageLink) {
            try {
                const downloadPageRes = await this.client.get(downloadPageLink, this.getHeaders(downloadPageLink));
                const downloadDoc = new Document(downloadPageRes.body);
                videoList = downloadDoc.select("div._4continuar > button:has(i.fa-download)").map(button => {
                    const onclickAttr = button.attr("onclick");
                    const urlMatch = onclickAttr.match(/'(https?:\/\/[^']+)'/);
                    if (urlMatch && urlMatch[1] && urlMatch[1].includes("xupload.org/download")) {
                        const finalUrl = urlMatch[1].replace("xupload.org/download", "hstorage.xyz/files") + "?download=1";
                        return { url: finalUrl, originalUrl: finalUrl, quality: button.text.trim(), headers: this.getHeaders(finalUrl) };
                    }
                    return null;
                }).filter(Boolean);
            } catch (e) { /* Method failed */ }
        }

        if (videoList.length > 0) {
            videoList.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
            const preferredQuality = this.getPreference("preferred_quality");
            if (preferredQuality !== "ask") {
                let targetStream = videoList.find(q => q.quality.includes(preferredQuality)) ||
                                 videoList.find(q => parseInt(q.quality) <= parseInt(preferredQuality));
                if (preferredQuality === "best") targetStream = videoList[0];
                if (preferredQuality === "worst") targetStream = videoList[videoList.length - 1];
                if (targetStream) videoList.unshift(videoList.splice(videoList.indexOf(targetStream), 1)[0]);
            }
        }

        if (videoList.length === 0) {
            const postIdMatch = doc.body.attr("class").match(/postid-(\d+)/);
            if (postIdMatch) {
                const postId = postIdMatch[1];
                const servers = doc.select("ul#playeroptionsul > li.dooplay_player_option");
                for (const server of servers) {
                    const serverName = server.text.trim();
                    const nume = server.attr("data-nume");
                    const ajaxUrl = `${this.getBaseUrl()}/wp-admin/admin-ajax.php`;
                    const ajaxHeaders = { ...this.getHeaders(ajaxUrl), "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" };
                    try {
                        const ajaxRes = await this.client.post(ajaxUrl, { "action": `doo_player_ajax`, "post": postId, "nume": nume, "type": "movie" }, ajaxHeaders);
                        const embedData = JSON.parse(ajaxRes.body);
                        const embedUrlMatch = embedData.embed_url.match(/src="([^"]+)"/);
                        if (embedUrlMatch && embedUrlMatch[1]) {
                            const sourceParam = new URL(embedUrlMatch[1]).searchParams.get('source');
                            if (sourceParam) {
                                const videoUrl = decodeURIComponent(sourceParam);
                                videoList.push({ url: videoUrl, originalUrl: videoUrl, quality: serverName, headers: this.getHeaders(videoUrl) });
                            }
                        }
                    } catch (e) { /* Ignore */ }
                }
            }
        }
        return videoList;
    }

    getFilterList() {
        const toOption = (item) => ({ type_name: "SelectOption", name: item.name, value: item.value });
        const genres = [
            { name: '3D', value: '3d' },
            { name: 'Ahegao', value: 'ahegao' },
            { name: 'Anal', value: 'anal' },
            { name: 'Blackmail', value: 'blackmail' },
            { name: 'Blowjob', value: 'blowjob' },
            { name: 'Bondage', value: 'bondage' },
            { name: 'Bukakke', value: 'bukakke' },
            { name: 'Censored', value: 'censored' },
            { name: 'Comedy', value: 'comedy' },
            { name: 'Creampie', value: 'creampie' },
            { name: 'Dark Skin', value: 'dark-skin' },
            { name: 'Deepthroat', value: 'deepthroat' },
            { name: 'Demons', value: 'demons' },
            { name: 'Double Penatration', value: 'double-penatration' },
            { name: 'Elf', value: 'elf' },
            { name: 'Facial', value: 'facial' },
            { name: 'Fantasy', value: 'fantasy' },
            { name: 'Femdom', value: 'femdom' },
            { name: 'Futanari', value: 'futanari' },
            { name: 'Gangbang', value: 'gangbang' },
            { name: 'Harem', value: 'harem' },
            { name: 'Horny Slut', value: 'horny-slut' },
            { name: 'Incest', value: 'incest' },
            { name: 'Lolicon', value: 'lolicon' },
            { name: 'Large Breasts', value: 'large-breasts' },
            { name: 'Milf', value: 'milf' },
            { name: 'NTR', value: 'ntr' },
            { name: 'Public Sex', value: 'public-sex' },
            { name: 'Rape', value: 'rape' },
            { name: 'School Girls', value: 'school-girls' },
            { name: 'Super Power', value: 'super-power' },
            { name: 'Supernatural', value: 'supernatural' },
            { name: 'Tits Fuck', value: 'tits-fuck' },
            { name: 'Toys', value: 'toys' },
            { name: 'Uncensored', value: 'uncensored' },
            { name: 'Vanilla', value: 'vanilla-id-1' },
            { name: 'X-ray', value: 'x-ray' },
            { name: 'Yuri', value: 'yuri' }
        ];
        const yearOptions = [{ type_name: "SelectOption", name: "Any", value: "" }];
        for (let y = new Date().getFullYear() + 2; y >= 1999; y--) {
            yearOptions.push({ type_name: "SelectOption", name: y.toString(), value: y.toString() });
        }
        return [
            { type_name: "HeaderFilter", name: "NOTE: Search query overrides all filters." },
            { 
                type_name: "SelectFilter", name: "Content Type", state: 0, 
                values: [ 
                    { name: "All Series", value: "series" },
                    { name: "Filter by Genre", value: "genre" },
                    { name: "Filter by Year", value: "year" }
                ].map(toOption)
            },
            { type_name: "SelectFilter", name: "Genre", state: 0, values: [{ type_name: "SelectOption", name: "Any", value: "" }, ...genres.sort((a, b) => a.name.localeCompare(b.name)).map(toOption)] },
            { type_name: "SelectFilter", name: "Year", state: 0, values: yearOptions },
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "enable_latest_tab",
                switchPreferenceCompat: {
                    title: "Enable 'Latest' Tab",
                    summary: "Shows the most recently added episodes.",
                    value: true,
                }
            },
            {
                key: "preferred_quality",
                listPreference: {
                    title: "Preferred Quality",
                    summary: "Select the quality to play by default. All other qualities will still be available.",
                    entries: ["Best", "Worst", "1440p", "1080p", "720p", "480p", "Ask"],
                    entryValues: ["best", "worst", "1440", "1080", "720", "480", "ask"],
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
