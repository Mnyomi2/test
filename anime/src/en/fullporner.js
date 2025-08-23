const mangayomiSources = [{
    "name": "FullPorner",
    "id": 69032189045,
    "lang": "en",
    "baseUrl": "https://fullporner.com",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=fullporner.com",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": true,
    "version": "1.0.0",
    "pkgPath": "nsfw/src/en/fullporner.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    // A helper to parse a list of items from a page
    async _parsePage(url) {
        const res = await this.client.get(url);
        const doc = new Document(res.body);

        const list = [];
        const items = doc.select("div.video-block div.video-card");
        for (const item of items) {
            const parsed = this._parseItem(item);
            if (parsed) {
                list.push(parsed);
            }
        }

        const hasNextPage = doc.selectFirst("a.page-link[rel=next]") != null;
        return { list, hasNextPage };
    }

    // A helper to parse a single item element
    _parseItem(element) {
        const title = element.selectFirst("div.video-title a")?.text;
        const href = element.selectFirst("div.video-title a")?.getHref;
        let imageUrl = element.selectFirst("div.video-card-image a img")?.attr("data-src");

        if (!title || !href) {
            return null;
        }

        if (imageUrl && !imageUrl.startsWith("http")) {
            imageUrl = new URL(imageUrl, this.source.baseUrl).href;
        }

        return {
            name: title.trim(),
            link: href,
            imageUrl: imageUrl
        };
    }

    async getPopular(page) {
        // The CS3 code's first entry is "Featured" which points to /home/
        const url = `${this.source.baseUrl}/home/${page}`;
        return this._parsePage(url);
    }

    async getLatestUpdates(page) {
        // Using the website's "Newest" section for latest updates
        const url = `${this.source.baseUrl}/newest/${page}`;
        return this._parsePage(url);
    }

    async search(query, page, filters) {
        const url = `${this.source.baseUrl}/search?q=${query.replace(/ /g, "+")}&p=${page}`;
        return this._parsePage(url);
    }

    // Helper to determine video qualities from a number/binary string
    btq(f) {
        let num;
        // The source can pass a decimal integer or a binary string
        if (typeof f === 'string') {
             // If it contains non-digit characters, assume binary, otherwise decimal.
            if (/[^0-9]/.test(f)) {
                num = parseInt(f, 2); 
            } else {
                num = parseInt(f, 10);
            }
        } else {
            num = f;
        }

        const result = [];
        if ((num & 1) !== 0) result.push("360");
        if ((num & 2) !== 0) result.push("480");
        if ((num & 4) !== 0) result.push("720");
        if ((num & 8) !== 0) result.push("1080");
        return result;
    }

    // Helper to construct poster URL
    getPoster(id, hasQuality) {
        if (!id) return null;
        if (hasQuality) {
            return `https://xiaoshenke.net/vid/${id}/720/i`;
        } else {
            const path = `${Math.floor(parseInt(id) / 1000)}000`;
            return `https://imgx.xiaoshenke.net/posterz/contents/videos_screenshots/${path}/${id}/preview_720p.mp4.jpg`;
        }
    }

    async getDetail(url) {
        const res = await this.client.get(url);
        const doc = new Document(res.body);

        const name = doc.selectFirst("div.single-video-title h2")?.text?.trim() || "Unknown Title";
        const description = name; // No separate description, use title
        const genre = doc.select("p.tag-link span a").map(it => it.text.replace("#", ""));
        
        const iframeUrl = doc.selectFirst("div.single-video iframe")?.attr("src");
        if (!iframeUrl) {
            throw new Error("Video iframe not found.");
        }

        const iframeRes = await this.client.get(iframeUrl);
        const iframeHtml = iframeRes.body;

        const idMatch = iframeHtml.match(/var id = "(.+?)"/);
        const videoID = idMatch ? idMatch[1].split('').reverse().join('') : null;

        const qMatch = iframeUrl.match(/\/(\d+|\w+)$/);
        const q = qMatch ? qMatch[1] : 0;
        
        const qualities = this.btq(q);
        const imageUrl = this.getPoster(videoID, qualities.length > 0);

        // Pass data to getVideoList via the chapter URL
        const linkData = {
            qualities: qualities,
            id: videoID
        };

        const chapters = [{
            name: "Movie",
            url: JSON.stringify(linkData),
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
        if (!data.id || !data.qualities) {
            return [];
        }

        const videos = [];
        for (const quality of data.qualities) {
            const videoUrl = `https://xiaoshenke.net/vid/${data.id}/${quality}`;
            videos.push({
                url: videoUrl,
                originalUrl: videoUrl,
                quality: `${quality}p`,
            });
        }
        
        // Reverse to show higher qualities first
        return videos.reverse();
    }
}