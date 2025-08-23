const mangayomiSources = [{
    "name": "FullPorner",
    "id": 690851324,
    "lang": "en",
    "baseUrl": "https://fullporner.com",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=fullporner.com",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": true,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/fullporner.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getHeaders() {
        return {
            "Referer": this.source.baseUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
        };
    }

    // Helper function to parse a single video item from a list page
    parseItem(element) {
        const linkElement = element.selectFirst("div.video-card-body div.video-title a");
        const name = linkElement.text;
        const link = linkElement.getHref;
        const imageUrl = element.selectFirst("div.video-card-image a img").attr("data-src");
        return { name, link, imageUrl };
    }

    // Helper function to determine available video qualities from a numeric code
    btq(q) {
        const num = parseInt(q, 10);
        const result = [];
        if ((num & 1) !== 0) result.push("360");
        if ((num & 2) !== 0) result.push("480");
        if ((num & 4) !== 0) result.push("720");
        if ((num & 8) !== 0) result.push("1080");
        return result.reverse(); // Higher quality first
    }

    async getPopular(page) {
        const url = `${this.source.baseUrl}/home/${page}`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const items = doc.select("div.video-block div.video-card");
        const list = items.map(it => this.parseItem(it));
        return { list, hasNextPage: list.length > 0 };
    }

    async getLatestUpdates(page) {
        // Using "Amateur" category for latest updates
        const url = `${this.source.baseUrl}/category/amateur/${page}`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const items = doc.select("div.video-block div.video-card");
        const list = items.map(it => this.parseItem(it));
        return { list, hasNextPage: list.length > 0 };
    }

    async search(query, page, filters) {
        const url = `${this.source.baseUrl}/search?q=${encodeURIComponent(query)}&p=${page}`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const items = doc.select("div.video-block div.video-card");
        const list = items.map(it => this.parseItem(it));
        const hasNextPage = doc.selectFirst("ul.pagination li.page-item a[rel=next]") != null;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const name = doc.selectFirst("div.single-video-title h2").text.trim();
        const genre = doc.select("div.single-video-title p.tag-link span a").map(it => it.text.replace("#", ""));
        const description = name; // Source uses title as description
        const imageUrl = doc.selectFirst("meta[property='og:image']")?.attr("content");

        const iframeUrl = doc.selectFirst("div.single-video iframe")?.attr("src");
        if (!iframeUrl) {
            throw new Error("Video player not found.");
        }

        const iframeRes = await this.client.get(iframeUrl, this.getHeaders());
        const iframeBody = iframeRes.body;

        const videoIdMatch = iframeBody.match(/var id = "(.+)"/);
        if (!videoIdMatch || !videoIdMatch[1]) {
            throw new Error("Video ID not found in player.");
        }
        const videoID = videoIdMatch[1].split('').reverse().join('');

        const q = new URL(iframeUrl).pathname.split('/').pop();
        const qualities = this.btq(q);

        const chapterUrlData = JSON.stringify({
            qualities: qualities,
            id: videoID
        });

        const chapters = [{
            name: "Movie",
            url: chapterUrlData,
        }];

        return {
            name,
            imageUrl,
            description,
            genre,
            status: 1, // Completed
            chapters,
            link: url
        };
    }

    async getVideoList(url) {
        const data = JSON.parse(url);
        const videoID = data.id;
        const qualities = data.qualities;
        const prefix = "https://xiaoshenke.net/vid";

        const videos = qualities.map(quality => ({
            url: `${prefix}/${videoID}/${quality}`,
            originalUrl: `${prefix}/${videoID}/${quality}`,
            quality: `${quality}p`,
            headers: this.getHeaders()
        }));
        
        return videos;
    }
}