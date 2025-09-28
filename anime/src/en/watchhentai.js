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
        // If the provided URL is an episode page, find the main series page URL first.
        // This ensures we always get the full series details and episode list.
        if (url.includes("/videos/")) {
            const initialRes = await this.client.get(url, this.getHeaders(url));
            const initialDoc = new Document(initialRes.body);
            const seriesLinkElement = initialDoc.selectFirst("div.pag_episodes a:has(i.fa-bars), div#serie_contenido a");
            if (seriesLinkElement) {
                url = seriesLinkElement.getHref;
            } else {
                // Fallback for single-episode videos that might not link back to a series page.
                return this.parseEpisodePageAsSeries(initialDoc, url);
            }
        }

        // Fetch and parse the series page.
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        return this.parseSeriesPage(doc, url);
    }

    parseSeriesPage(doc, url) {
        const name = doc.selectFirst("div.data h1").text.trim();
        const img = doc.selectFirst("div.poster img");
        const imageUrl = img?.attr("data-src") || img?.getSrc;
        const link = url;
        const status = 1;

        let description = doc.selectFirst("div#description p")?.text?.trim() ?? "";
        
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

        const favCount = doc.selectFirst("a.clicklogin:has(i.fa-plus-circle) > span")?.text;
        if(favCount) details.push(`Favorites: ${favCount}`);

        doc.select("div.sbox div.custom_fields").forEach(element => {
            const key = element.selectFirst("b.variante")?.text?.trim();
            const value = element.selectFirst("span.valor")?.text?.trim();
            if (key && value) {
                details.push(`${key}: ${value}`);
            }
        });

        if (details.length > 0) {
            description += `\n\n----\n${details.join('\n')}`;
        }
    
        const genre = doc.select("div.sgeneros a").map(el => el.text.trim());
    
        const chapters = [];
        doc.select("ul.episodios > li").forEach(element => {
            const a = element.selectFirst("div.episodiotitle a");
            if (a) {
                chapters.push({ name: a.text.trim(), url: a.getHref });
            }
        });
        
        chapters.reverse();
    
        return { name, imageUrl, description, link, status, genre, chapters };
    }

    parseEpisodePageAsSeries(doc, url) {
        const headerText = doc.selectFirst("h3 > strong")?.text ?? "Episode";
        const name = headerText.replace(/episode\s*\d+/i, '').replace(/stream|english subbed/gi, '').trim();
        const imageUrl = doc.selectFirst('meta[itemprop="thumbnailUrl"]')?.attr("content");
        const description = doc.selectFirst("div.synopsis p")?.text?.replace("Synopsis:", "").trim() ?? "No description available.";
        const genre = doc.select("nav.genres li a").map(el => el.text.trim());
        const chapters = [];
        
        doc.select("div#seasons ul.episodios > li").forEach(element => {
            const a = element.selectFirst("div.episodiotitle a");
            if (a) {
                chapters.push({ name: a.text.trim(), url: a.getHref });
            }
        });

        if (chapters.length === 0) {
             chapters.push({ name: headerText, url: url });
        }
        
        chapters.reverse();

        return { name, imageUrl, description, link: url, status: 1, genre, chapters };
    }


    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const videoList = [];

        const downloadPageLink = doc.selectFirst("a.download-video")?.getHref;
        if (downloadPageLink) {
            try {
                const downloadPageRes = await this.client.get(downloadPageLink, this.getHeaders(downloadPageLink));
                const downloadDoc = new Document(downloadPageRes.body);
                const qualityButtons = downloadDoc.select("div._4continuar > button:has(i.fa-download)");

                for (const button of qualityButtons) {
                    const onclickAttr = button.attr("onclick");
                    const quality = button.text.trim();
                    if (onclickAttr) {
                        const urlMatch = onclickAttr.match(/'(https?:\/\/[^']+)'/);
                        if (urlMatch && urlMatch[1] && urlMatch[1].includes("xupload.org/download")) {
                            const finalUrl = urlMatch[1].replace("xupload.org/download", "hstorage.xyz/files") + "?download=1";
                            videoList.push({ url: finalUrl, originalUrl: finalUrl, quality: quality, headers: this.getHeaders(finalUrl) });
                        }
                    }
                }
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
                
                if (targetStream) {
                    const index = videoList.indexOf(targetStream);
                    if (index > 0) videoList.unshift(videoList.splice(index, 1)[0]);
                }
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
