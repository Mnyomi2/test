// --- METADATA ---
const mangayomiSources = [{
    "name": "HentaiTorrents",
    "id": 5928374928374291,
    "lang": "en",
    "baseUrl": "https://www.hentaitorrents.com",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://www.hentaitorrents.com",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.1",
    "pkgPath": "anime/src/en/hentaitorrents.js"
}];

// --- CLASS ---
class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getBaseUrl() {
        return this.source.baseUrl;
    }

    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl(),
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }

    parseListing(doc) {
        const list = [];
        const items = doc.select("div.image-wrapper");
        for (const item of items) {
            const name = item.selectFirst("a.overlay").text;
            let link = item.selectFirst("a.overlay").getHref;
            link = new URL(link, this.getBaseUrl()).href;
            const imageUrl = item.selectFirst("img").getSrc;
            list.push({ name, imageUrl, link });
        }
        return list;
    }

    async getPopular(page) {
        const url = page === 1 ? this.getBaseUrl() : `${this.getBaseUrl()}/page/${page}`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = this.parseListing(doc);
        return { list, hasNextPage: list.length > 0 };
    }

    async getLatestUpdates(page) {
        return this.getPopular(page);
    }

    async search(query, page, filters) {
        const url = `${this.getBaseUrl()}/?q=${encodeURIComponent(query)}&f_page=${page}`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = this.parseListing(doc);
        return { list, hasNextPage: list.length > 0 };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const name = doc.selectFirst("h1").text;
        const imageUrl = doc.selectFirst("div.container > img").getSrc;
        const link = url;
        let description = "No description available.";
        const genre = [];
        const articleContentElement = doc.selectFirst("div.article-content");
        if (articleContentElement) {
            const articleHtml = articleContentElement.html;
            const descMatch = articleHtml.match(/<b>\s*Description\s*<\/b>:(.*)/si);
            if (descMatch && descMatch[1]) {
                description = descMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
            } else {
                description = articleContentElement.text.trim();
            }
            const articleText = articleContentElement.text;
            const genreMatch = articleText.match(/Genre\s*:\s*([^\r\n]+)/);
            if (genreMatch && genreMatch[1]) {
                genre.push(...genreMatch[1].split(',').map(g => g.trim()));
            }
        }
        const status = 1;
        const chapters = [];
        const downloadElement = doc.selectFirst("div.download-container a.download-button");
        if (downloadElement) {
            let epUrl = downloadElement.getHref;
            epUrl = new URL(epUrl, this.getBaseUrl()).href;
            chapters.push({
                name: "Download Torrent",
                url: epUrl,
            });
        }
        return { name, imageUrl, description, link, status, genre, chapters };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const streams = [];
        const torrentLinkElement = doc.selectFirst("a.download-button");
        if (torrentLinkElement) {
            const torrentUrl = torrentLinkElement.getHref;
            streams.push({
                url: torrentUrl,
                originalUrl: torrentUrl,
                quality: "Torrent",
                headers: this.getHeaders(torrentUrl)
            });
        }
        return streams;
    }

    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [];
    }
}