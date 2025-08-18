const mangayomiSources = [{
    "name": "UltraHD Hub",
    "id": 4812213341314382500,
    "lang": "en",
    "baseUrl": "https://4khdhub.fans",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=4khdhub.fans",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "hasCloudflare": true,
    "pkgPath": "anime/src/en/uhdhub.js",
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
        const newUrl = this.getPreference("override_base_url");
        if (newUrl && newUrl.length > 0) {
            return newUrl.endsWith('/') ? newUrl.slice(0, -1) : newUrl;
        }
        return this.source.baseUrl;
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
        };
    }

    // --- CATALOGUE ---

    async _fetchCataloguePage(path) {
        const url = `${this.getBaseUrl()}${path}`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = [];

        const items = doc.select("a.movie-card");
        for (const item of items) {
            const link = item.getHref;
            const imageUrl = item.selectFirst("img")?.getSrc;
            const name = item.selectFirst("img")?.attr("alt");
            const typeText = item.selectFirst("span.movie-card-format")?.text?.toLowerCase();

            if (!link || !name || !typeText) continue;

            const type = typeText.includes("serie") ? "series" : "movie";
            list.push({
                name,
                imageUrl,
                link: `${link}||${type}`
            });
        }

        const nextLink = doc.selectFirst("a.pagination-item:contains(»)");
        const hasNextPage = !!nextLink;

        return { list, hasNextPage };
    }

    async getPopular(page) {
        const path = `/category/movies-10810.html/page/${page}`;
        return this._fetchCataloguePage(path);
    }

    async getLatestUpdates(page) {
        const path = `/category/new-series-10811.html/page/${page}`;
        return this._fetchCataloguePage(path);
    }

    async search(query, page, filters) {
        const path = `/page/${page}/?s=${encodeURIComponent(query)}`;
        return this._fetchCataloguePage(path);
    }

    // --- DETAILS ---

    async getDetail(url) {
        const [path, type] = url.split("||");
        const fullUrl = this.getBaseUrl() + path;
        const res = await this.client.get(fullUrl, this.getHeaders());
        const doc = new Document(res.body);

        const name = doc.selectFirst(".entry-title")?.text ?? doc.selectFirst("h1.post-title")?.text ?? 'Unknown';
        const imageUrl = doc.selectFirst(".movie-poster img")?.getSrc;
        const description = doc.select(".entry-content p").map(p => p.text).join("\n\n").trim();
        const genre = doc.select("a[rel='category tag']").map(a => a.text).filter(g => g !== 'Movies' && g !== 'Series');
        const status = 1; // Completed is a safe default

        let chapters = [];
        if (type === "series") {
            const seasonBlocks = doc.select("div.card.mb-3");
            for (const block of seasonBlocks) {
                const seasonTitle = block.selectFirst("h3.episode-title")?.text ?? '';
                const seasonNumberMatch = block.selectFirst(".episode-number")?.text?.match(/S(\d+)/i);
                const seasonNum = seasonNumberMatch ? seasonNumberMatch[1] : '';

                const episodeElements = block.select(".episode-list a.btn");
                for (const epElement of episodeElements) {
                    const episodeNumberMatch = epElement.selectFirst(".badge-psa")?.text?.match(/Episode (\d+)/i);
                    const epNum = episodeNumberMatch ? episodeNumberMatch[1] : '';
                    const chapterName = `S${seasonNum.padStart(2, '0')}E${epNum.padStart(2, '0')}`;
                    
                    const chapterUrlInfo = {
                        mainUrl: fullUrl,
                        seasonTitle: seasonTitle,
                        episodeBadge: epElement.selectFirst(".badge-psa")?.text ?? ''
                    };
                    chapters.push({
                        name: chapterName,
                        url: JSON.stringify(chapterUrlInfo)
                    });
                }
            }
            chapters.reverse();
        } else { // Movie
            const downloadItems = doc.select(".download-item");
            for (const item of downloadItems) {
                const size = item.selectFirst(".badge")?.text?.trim() ?? '';
                const fileNameParts = item.selectFirst(".flex")?.text?.split('<br>');
                const fileName = fileNameParts ? fileNameParts[0].trim() : name;
                const hubCloudUrl = item.selectFirst("a:contains(Hub-Cloud)")?.getHref ?? '';
                const hubDriveUrl = item.selectFirst("a:contains(Hubdrive)")?.getHref ?? '';
                
                const chapterName = `${fileName} [${size}]`;
                const chapterUrlInfo = { hubCloudUrl, hubDriveUrl };

                chapters.push({
                    name: chapterName,
                    url: JSON.stringify(chapterUrlInfo)
                });
            }
        }

        return { name, imageUrl, description, link: path, status, genre, chapters };
    }


    // --- VIDEO ---

    async getVideoList(url) {
        const info = JSON.parse(url);
        let serverLinks = [];

        if (info.hubCloudUrl || info.hubDriveUrl) { // Movie
            if (info.hubCloudUrl) serverLinks.push(info.hubCloudUrl);
            if (info.hubDriveUrl) serverLinks.push(info.hubDriveUrl);
        } else { // Series
            const res = await this.client.get(info.mainUrl, this.getHeaders());
            const doc = new Document(res.body);
            const seasonBlock = doc.select(`div.card:has(h3.episode-title:contains(${info.seasonTitle}))`)[0];
            if (seasonBlock) {
                 const episodeBlock = seasonBlock.select(`a.btn:has(span.badge-psa:contains(${info.episodeBadge}))`)[0]?.parent()?.parent();
                 if (episodeBlock) {
                    const hubCloudLink = episodeBlock.selectFirst("a:contains(Hub-Cloud)")?.getHref;
                    const hubDriveLink = episodeBlock.selectFirst("a:contains(Hubdrive)")?.getHref;
                    if(hubCloudLink) serverLinks.push(hubCloudLink);
                    if(hubDriveLink) serverLinks.push(hubDriveLink);
                 }
            }
        }
        
        if (serverLinks.length === 0) {
            throw new Error("No server links found for this item.");
        }

        let finalVideos = [];
        for (const link of serverLinks) {
            try {
                const redirectUrl = await this._getRedirectLink(link);
                if (redirectUrl) {
                    const extracted = await this._extractFinalLinks(redirectUrl);
                    finalVideos.push(...extracted);
                }
            } catch (e) {
                console.error(`Failed to process link ${link}: ${e}`);
            }
        }
        
        if (finalVideos.length === 0) {
            throw new Error("Could not extract any video links.");
        }

        return finalVideos.map(v => ({ url: v, originalUrl: v, quality: "Default" }));
    }

    // --- PREFERENCES ---

    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "For temporary changes..",
                value: this.source.baseUrl,
                dialogTitle: "Override Base URL",
                dialogMessage: `Default: ${this.source.baseUrl}`,
            }
        }];
    }

    // --- LINK EXTRACTION HELPERS ---

    _base64Decode(str) {
        try {
            return atob(str);
        } catch (e) {
            console.error(`Base64 decode failed for: ${str}`, e);
            return "";
        }
    }

    _hdhubPen(value) {
        let result = [];
        for (let i = 0; i < value.length; i++) {
            const char = value[i];
            const charCode = value.charCodeAt(i);
            if ('A' <= char && char <= 'Z') {
                result.push(String.fromCharCode(((charCode - 65 + 13) % 26) + 65));
            } else if ('a' <= char && char <= 'z') {
                result.push(String.fromCharCode(((charCode - 97 + 13) % 26) + 97));
            } else {
                result.push(char);
            }
        }
        return result.join("");
    }

    async _getRedirectLink(url) {
        const res = await this.client.get(url, this.getHeaders());
        const docContent = res.body;

        const regex = /s\('o','([A-Za-z0-9+/=]+)'|ck\('_wp_http_\d+','([^']+)'/g;
        const matches = [...docContent.matchAll(regex)];

        const combinedString = matches.map(m => m[1] || m[2]).join('');
        if (!combinedString) return "";

        const step1 = this._base64Decode(combinedString);
        const step2 = this._base64Decode(step1);
        const step3 = this._hdhubPen(step2);
        const finalDecoded = this._base64Decode(step3);

        const jsonObj = JSON.parse(finalDecoded);
        const encodedUrl = this._base64Decode(jsonObj.o || "").trim();
        const data = btoa(jsonObj.data || "").trim();
        const blogUrl = jsonObj.blog_url || "";

        if (encodedUrl) return encodedUrl;

        if (blogUrl && data) {
            const directLinkUrl = `${blogUrl}?re=${data}`;
            const directRes = await this.client.get(directLinkUrl, this.getHeaders());
            return directRes.body.trim();
        }

        return "";
    }

    async _extractFinalLinks(url) {
        const res = await this.client.get(url, this.getHeaders());
        const docContent = res.body;
        const links = [];

        // Hubdrive pattern
        let match = docContent.match(/<a[^>]*class="btn btn-primary btn-user btn-success1 m-1"[^>]*href="([^"]+)"/);
        if (match && match[1]) {
            if (match[1].includes('drive')) {
                return this._extractFinalLinks(match[1]);
            } else {
                // This case might need further handling if it's not a direct link
            }
        }
        
        // Drive pattern
        match = docContent.match(/var url = '([^']*)'/);
        if (match && match[1]) {
             url = match[1]; // re-assign url to the new one
        }

        // Hubcloud pattern
        match = docContent.match(/<div class="vd.*?<center>.*?<a[^>]*href="([^"]+)"/s);
        if (match && match[1]) {
             url = match[1]; // re-assign url
        }

        const finalPageRes = await this.client.get(url, { ...this.getHeaders(), "Referer": url });
        const finalDoc = finalPageRes.body;
        
        const linkMatches = [...finalDoc.matchAll(/<a[^>]*href="([^"]+)"[^>]*rel="noreferrer[^"]*"[^>]*>(?:<i[^>]*>.*?<\/i>\s*)?([^<]+)<\/a>/g)];
        
        for (const m of linkMatches) {
            const dlink = m[1];
            const text = m[2].trim();
            if (text.includes("Download [FSL Server]") || text.includes("Download File")) {
                links.push(dlink);
            }
            // Add more specific handlers for BuzzServer, pixeldra, etc. if needed
        }

        // Final Ajax fallback
        if (links.length === 0) {
            const fileIdMatch = url.match(/\/file\/([^/]+)/);
            if (fileIdMatch) {
                const fileId = fileIdMatch[1];
                const parsedUrl = new URL(url);
                const ajaxUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}/ajax.php?ajax=direct-download`;
                const ajaxRes = await this.client.post(ajaxUrl, 
                    {...this.getHeaders(), "X-Requested-With": "XMLHttpRequest", "Origin": `${parsedUrl.protocol}//${parsedUrl.hostname}`},
                    `id=${fileId}`
                );
                const jsonRes = JSON.parse(ajaxRes.body);
                if(jsonRes.gd) links.push(jsonRes.gd);
            }
        }
        
        return links;
    }
}