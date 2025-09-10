const mangayomiSources = [{
    "name": "HentaiHaven",
    "id": 1696954203651,
    "lang": "en",
    "baseUrl": "https://hentaihaven.co",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hentaihaven.co",
    "typeSource": "single",
    "isNsfw": true,
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/hentaihaven.js"
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
        return this.source.baseUrl;
    }

    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl(),
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }

    async getPopular(page) {
        const url = `${this.getBaseUrl()}/?page=${page}`;
        return this.parseDirectory(url);
    }

    async getLatestUpdates(page) {
        // The site's homepage is the latest updates.
        return this.getPopular(page);
    }

    async search(query, page, filters) {
        const url = `${this.getBaseUrl()}/search/${query}?page=${page}`;
        return this.parseDirectory(url);
    }

    async parseDirectory(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = [];
        const items = doc.select("a.a_item");

        for (const item of items) {
            const name = item.selectFirst("div.video_title").text;
            const link = this.getBaseUrl() + item.getHref;
            const imageUrl = this.getBaseUrl() + item.selectFirst("img").getSrc;
            list.push({ name, imageUrl, link });
        }

        const hasNextPage = items.length > 0;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const seriesName = doc.selectFirst("span:contains(Series) + span.sub_r a")?.text;
        const name = seriesName ?? doc.selectFirst("h1.video_title").text;
        const imageUrl = this.getBaseUrl() + doc.selectFirst("div.cover img").getSrc;
        const description = doc.selectFirst("div.video_description p")?.text ?? "";
        const link = url;
        const status = 1; // All items are single episodes, treated as 'Completed'

        const genre = [];
        const genreElements = doc.select(".video_tags > a, .tags_list > a");
        for (const element of genreElements) {
            genre.push(element.text);
        }

        const chapters = [];
        const episodeElements = doc.select("div.mfs_item");

        if (episodeElements.length > 0) {
            for (const element of episodeElements) {
                const epName = element.selectFirst("div.infos .title a").text;
                const epUrl = this.getBaseUrl() + element.selectFirst("div.infos .title a").getHref;
                chapters.push({ name: epName, url: epUrl });
            }
            chapters.reverse();
        } else {
            // Handle standalone videos not part of a series
            const epName = doc.selectFirst("h1.video_title").text;
            chapters.push({ name: epName, url: url });
        }

        return { name, imageUrl, description, link, status, genre, chapters };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const streams = [];

        const playerDataId = doc.selectFirst("li[data-id]")?.attr("data-id");
        if (!playerDataId) {
            return [];
        }

        const playerUrl = "https://nhplayer.com" + playerDataId;
        const playerRes = await this.client.get(playerUrl, this.getHeaders(playerUrl));
        const scriptContent = playerRes.body;

        const streamUrlMatch = scriptContent.match(/file:\s*['"](.*?)['"]/);
        if (streamUrlMatch && streamUrlMatch[1]) {
            const fullStreamUrl = streamUrlMatch[1];
            // Remove query parameters like '?expire=...' as requested
            const streamUrl = fullStreamUrl.split("?")[0];

            streams.push({
                url: streamUrl,
                originalUrl: streamUrl,
                quality: "Default",
                headers: this.getHeaders(streamUrl)
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