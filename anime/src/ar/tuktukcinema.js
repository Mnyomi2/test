const mangayomiSources = [{
    "name": "Tuktukcinema",
    "id": 645839201,
    "baseUrl": "https://tuk.cam",
    "lang": "ar",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=tuk.cam",
    "itemType": 1,
    "version": "1.0.1",
    "pkgPath": "anime/src/ar/tuktukcinema.js",
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    async requestDoc(path) {
        const url = this.source.baseUrl + path;
        const res = await this.client.get(url);
        return new Document(res.body);
    }

    _titleEdit(title, isDetails = false) {
        const movieRegex = /^(?:فيلم|عرض)\s(.*\s\d+)\s(.+?)\s/;
        const seriesRegex = /^(?:مسلسل|برنامج|انمي)\s(.+)\sالحلقة\s(\d+)/;

        let match = title.match(movieRegex);
        if (match) {
            const movieName = match[1];
            const type = match[2];
            return isDetails ? `${movieName} (${type})` : movieName;
        }

        match = title.match(seriesRegex);
        if (match) {
            const seriesName = match[1];
            const epNum = match[2];
            if (isDetails) {
                return `${seriesName} (ep:${epNum})`;
            }
            return seriesName.includes("الموسم") ? seriesName.split("الموسم")[0].trim() : seriesName;
        }
        return title.trim();
    }

    async _parseCataloguePage(doc, isSearch = false) {
        const list = [];
        const items = doc.select("div.Block--Item, div.Small--Box");
        items.forEach(item => {
            const linkElement = item.selectFirst("a");
            if (!linkElement) return;

            const name = this._titleEdit(linkElement.attr("title"), true);
            let imageUrlAttr = isSearch ? "src" : "data-src";
            const imageUrl = item.selectFirst("img")?.attr(imageUrlAttr);
            const link = linkElement.getHref + "watch/";

            list.push({ name, imageUrl, link });
        });

        const hasNextPage = !!doc.selectFirst("div.pagination ul.page-numbers li a.next");
        return { list, hasNextPage };
    }

    async getPopular(page) {
        const doc = await this.requestDoc(`/category/movies/?page=${page}`);
        return await this._parseCataloguePage(doc);
    }

    async getLatestUpdates(page) {
        const doc = await this.requestDoc(`/recent/page/${page}/`);
        return await this._parseCataloguePage(doc);
    }

    async search(query, page, filters) {
        let path;
        if (query) {
            path = `/?s=${encodeURIComponent(query)}&page=${page}`;
        } else {
            const categoryFilter = filters[0];
            const selectedCategory = categoryFilter.values[categoryFilter.state].value;
            if (selectedCategory) {
                path = `/${selectedCategory}?page=${page}/`;
            } else {
                return this.getPopular(page);
            }
        }
        const doc = await this.requestDoc(path);
        return await this._parseCataloguePage(doc, !!query);
    }

    async getDetail(url) {
        const doc = await this.requestDoc(url.replace(this.source.baseUrl, ''));

        const name = this._titleEdit(doc.selectFirst("h1.post-title").text);
        const imageUrl = doc.selectFirst("div.left div.image img")?.getSrc;
        const description = doc.selectFirst("div.story")?.text.trim();
        const genre = doc.select("div.catssection li a").map(e => e.text);
        const status = 1; // Completed, as most sites like this are.

        const chapters = [];
        const seasons = doc.select("section.allseasonss div.Block--Item");

        if (seasons.length > 0) {
            // It's a series with seasons
            for (const season of seasons.slice().reverse()) {
                const seasonNumText = season.selectFirst("h3").text;
                const seasonLink = season.selectFirst("a").getHref;

                const seasonDoc = seasonLink.endsWith(url) ? doc : await this.requestDoc(seasonLink.replace(this.source.baseUrl, ''));

                seasonDoc.select("section.allepcont a").forEach(ep => {
                    const epUrl = ep.getHref + "watch/";
                    const epNum = ep.selectFirst("div.epnum").text.replace(/\D/g, '');
                    const epName = `${seasonNumText} : الحلقة ${epNum}`;
                    chapters.push({ name: epName, url: epUrl });
                });
            }
        } else {
            // It's a movie or single-episode show
            chapters.push({ name: "مشاهدة", url });
        }

        return { name, imageUrl, description, genre, status, chapters, link: url };
    }

    async getVideoList(url) {
        const doc = await this.requestDoc(url.replace(this.source.baseUrl, ''));
        const serverElements = doc.select("div.watch--servers--list ul li.server--item");

        let videos = [];
        for (const element of serverElements) {
            const extracted = await this._extractVideos(element);
            if (extracted) videos.push(...extracted);
        }

        const preferredQuality = this.getPreference("preferred_quality") || "720";
        videos.sort((a, b) => {
            const aPreferred = a.quality.includes(preferredQuality);
            const bPreferred = b.quality.includes(preferredQuality);
            if (aPreferred && !bPreferred) return -1;
            if (!aPreferred && bPreferred) return 1;
            return 0; // Keep original order among same-preference videos
        });

        return videos;
    }

    async _extractVideos(element) {
        const serverUrl = element.attr("data-link");
        const serverName = element.text;

        if (serverName.includes("Main")) {
            return await this._videosFromMain(serverUrl);
        }
        if (serverName.includes("Upstream") || serverName.includes("Streamruby") || serverName.includes("Streamwish")) {
            return await this._videosFromOthers(serverUrl, serverName);
        }
        // External extractors like Okru, Dood, etc. are not implemented here.
        return [];
    }

    async _jsUnpack(packedJS) {
        try {
            let p = packedJS.substring(packedJS.indexOf("'") + 1);
            p = p.substring(0, p.indexOf("'"));
            let a = parseInt(packedJS.substring(packedJS.indexOf(",") + 1, packedJS.indexOf(",", packedJS.indexOf(",") + 1)));
            let c = parseInt(packedJS.substring(packedJS.lastIndexOf(",") - 2, packedJS.lastIndexOf(",")));
            let k = packedJS.substring(packedJS.indexOf("'.split('|'))"), packedJS.indexOf("',"));
            k = k.substring(k.indexOf("'") + 1).split('|');
            let e = function (c) {
                return (c < a ? "" : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
            };
            let d = function (c) {
                return k[c];
            };
            let i = c;
            let unpacked = p.replace(/\b\w+\b/g, e);
            while (i--) {
                if (k[i]) {
                    unpacked = unpacked.replace(new RegExp('\\b' + e(i) + '\\b', 'g'), k[i]);
                }
            }
            return unpacked;
        } catch (e) {
            return null;
        }
    }

    async _videosFromMain(url) {
        const res = await this.client.get(url);
        const scriptData = res.body.match(/eval\(function\(p,a,c,k,e,d\).*\)/s)?.[0];
        if (!scriptData) return [];

        const unpacked = await this._jsUnpack(scriptData);
        if (!unpacked) return [];

        const fileLinks = unpacked.substring(unpacked.indexOf("file")).split('",')[0];
        const videos = [];
        const regex = /\[(.*?)\](.*?mp4)/g;
        let match;
        while ((match = regex.exec(fileLinks)) !== null) {
            videos.push({
                url: match[2],
                originalUrl: match[2],
                quality: `Main: ${match[1]}`,
            });
        }
        return videos;
    }

    async _parseM3U8(m3u8Content, baseUrl, prefix) {
        const videos = [];
        const lines = m3u8Content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                const resolutionMatch = lines[i].match(/RESOLUTION=(\d+x\d+)/);
                const quality = resolutionMatch ? resolutionMatch[1] : 'Unknown';
                const videoUrl = new URL(lines[i + 1], baseUrl).href;
                videos.push({
                    url: videoUrl,
                    originalUrl: videoUrl,
                    quality: `${prefix} - ${quality}`,
                });
            }
        }
        if (videos.length === 0 && m3u8Content.includes('.m3u8')) {
            videos.push({
                url: baseUrl,
                originalUrl: baseUrl,
                quality: `${prefix} - Auto`,
            });
        }
        return videos;
    }


    async _videosFromOthers(url, prefix) {
        const res = await this.client.get(url);
        const scriptData = res.body.match(/eval\(function\(p,a,c,k,e,d\).*\)/s)?.[0];
        if (!scriptData) return [];

        const unpacked = await this._jsUnpack(scriptData);
        if (!unpacked) return [];

        const masterUrl = unpacked.match(/file:"([^"]+)"/)?.[1];
        if (!masterUrl) return [];

        const m3u8Res = await this.client.get(masterUrl, { "Referer": url });
        return this._parseM3U8(m3u8Res.body, masterUrl, prefix);
    }

    getFilterList() {
        const categories = [{
            "name": "اختر",
            "query": ""
        }, {
            "name": "كل الافلام",
            "query": "category/movies-33/"
        }, {
            "name": "افلام اجنبى",
            "query": "category/movies-33/افلام-اجنبي/"
        }, {
            "name": "افلام انمى",
            "query": "category/anime-6/افلام-انمي/"
        }, {
            "name": "افلام تركيه",
            "query": "category/movies-33/افلام-تركي/"
        }, {
            "name": "افلام اسيويه",
            "query": "category/movies-33/افلام-اسيوي/"
        }, {
            "name": "افلام هنديه",
            "query": "category/movies-33/افلام-هندى/"
        }, {
            "name": "كل المسسلسلات",
            "query": "category/series-9/"
        }, {
            "name": "مسلسلات اجنبى",
            "query": "category/series-9/مسلسلات-اجنبي/"
        }, {
            "name": "مسلسلات انمى",
            "query": "category/anime-6/انمي-مترجم/"
        }, {
            "name": "مسلسلات تركى",
            "query": "category/series-9/مسلسلات-تركي/"
        }, {
            "name": "مسلسلات اسيوى",
            "query": "category/series-9/مسلسلات-أسيوي/"
        }, {
            "name": "مسلسلات هندى",
            "query": "category/series-9/مسلسلات-هندي/"
        }, ];

        return [{
            type_name: "SelectFilter",
            name: "الأقسام",
            state: 0,
            values: categories.map(c => ({
                type_name: "SelectOption",
                name: c.name,
                value: c.query
            }))
        }];
    }

    getSourcePreferences() {
        return [{
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة",
                summary: "اختر الجودة المفضلة لديك",
                valueIndex: 0,
                entries: ["720p", "480p", "360p", "Auto"],
                entryValues: ["720", "480", "360", "Auto"],
            }
        }];
    }
}