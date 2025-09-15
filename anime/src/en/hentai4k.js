const mangayomiSources = [{
    "name": "Hentai4K",
    "id": 6901835741833131337,
    "lang": "en",
    "baseUrl": "https://hentai4k.com",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hentai4k.com",
    "typeSource": "single",
    "isNsfw": true,
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/hentai4k.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.supportsLatest = true;
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
        const url = `${this.getBaseUrl()}/most-popular/${page > 1 ? page + '/' : ''}`;
        return this.parseDirectory(url);
    }
    
    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/latest-updates/${page > 1 ? page + '/' : ''}`;
        return this.parseDirectory(url);
    }

    async search(query, page, filters) {
        const baseUrl = this.getBaseUrl();
        let url;

        if (query) {
            url = `${baseUrl}/search/${encodeURIComponent(query)}/${page > 1 ? page + '/' : ''}`;
            return this.parseDirectory(url);
        }

        const categoryFilter = filters.find(f => f.name === "Category");
        const categoryValue = categoryFilter ? categoryFilter.values[categoryFilter.state].value : "";

        const tagFilter = filters.find(f => f.name === "Tag");
        const tagValue = tagFilter ? tagFilter.values[tagFilter.state].value : "";

        const sortFilter = filters.find(f => f.name === "Sort by");
        const sortValue = sortFilter ? sortFilter.values[sortFilter.state].value : "most-popular";

        if (categoryValue) {
            url = `${baseUrl}/categories/${categoryValue}/${page > 1 ? page + '/' : ''}`;
        } else if (tagValue) {
            url = `${baseUrl}/tags/${tagValue}/${page > 1 ? page + '/' : ''}`;
        } else {
            url = `${baseUrl}/${sortValue}/${page > 1 ? page + '/' : ''}`;
        }

        return this.parseDirectory(url);
    }

    async parseDirectory(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = [];
        const items = doc.select("div.thumb.item");

        for (const item of items) {
            const a = item.selectFirst("a");
            if (!a) continue;

            const link = a.getHref;
            const name = a.attr("title").trim();
            const imageUrl = item.selectFirst("img")?.getSrc;

            if (link && name && imageUrl) {
                list.push({ name, imageUrl, link });
            }
        }
        
        const hasNextPage = doc.selectFirst("a.next") != null;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        const name = doc.selectFirst("h1.title").text.trim();
        const imageUrl = doc.selectFirst("div.block-screenshots img")?.getSrc;
        const description = "";
        const link = url;
        const status = 1; // Completed

        const genre = [];
        const genreElements = doc.select("div.top-options a.btn");
        for (const element of genreElements) {
            genre.push(element.text.trim());
        }

        const chapters = [{ name: "Watch", url: url }];

        return { name, imageUrl, description, link, status, genre, chapters };
    }

    async getVideoList(url) {
        const match = url.match(/\/videos\/(\d+)\//);
        if (!match) return [];
        
        const videoId = match[1];
        const dir = Math.floor((parseInt(videoId) - 1) / 1000) * 1000;
        const baseUrl = `https://i.hentai4k.com/videos/${dir}/${videoId}/${videoId}`;
        
        const videos = [];
        
        videos.push({
            url: `${baseUrl}_2160p.mp4`,
            originalUrl: `${baseUrl}_2160p.mp4`,
            quality: "4K (2160p)",
            headers: this.getHeaders(url)
        });
        videos.push({
            url: `${baseUrl}_1080p.mp4`,
            originalUrl: `${baseUrl}_1080p.mp4`,
            quality: "1080p",
            headers: this.getHeaders(url)
        });
        videos.push({
            url: `${baseUrl}_720p.mp4`,
            originalUrl: `${baseUrl}_720p.mp4`,
            quality: "720p",
            headers: this.getHeaders(url)
        });
        videos.push({
            url: `${baseUrl}.mp4`,
            originalUrl: `${baseUrl}.mp4`,
            quality: "480p",
            headers: this.getHeaders(url)
        });
        
        return videos;
    }

    getFilterList() {
        const sortOptions = [
            { name: "Most Popular", value: "most-popular" },
            { name: "Latest Updates", value: "latest-updates" },
            { name: "Top Rated", value: "top-rated" },
            { name: "Longest", value: "longest" },
        ];

        const categories = [
            { name: 'Ahegao', value: 'ahegao' }, { name: 'Anal', value: 'anal' }, { name: 'Big Ass', value: 'big-ass' },
            { name: 'Big Dick', value: 'big-dick' }, { name: 'Big Tits', value: 'big-tits' }, { name: 'Blowjob', value: 'blowjob' },
            { name: 'Cheating', value: 'cheating' }, { name: 'Creampie', value: 'creampie' }, { name: 'Dark Skin', value: 'dark-skin' },
            { name: 'Demon', value: 'demon' }, { name: 'Elf', value: 'elf' }, { name: 'Futanari', value: 'futanari' },
            { name: 'Hairy', value: 'hairy' }, { name: 'Handjob', value: 'handjob' }, { name: 'Hardcore', value: 'hardcore' },
            { name: 'Hentai', value: 'hentai' }, { name: 'Incest', value: 'incest' }, { name: 'Loli', value: 'loli' },
            { name: 'Maid', value: 'maid' }, { name: 'Masturbation', value: 'masturbation' }, { name: 'Milf', value: 'milf' },
            { name: 'Monster', value: 'monster' }, { name: 'Netorare', value: 'netorare' }, { name: 'Nurse', value: 'nurse' },
            { name: 'Orgy', value: 'orgy' }, { name: 'POV', value: 'pov' }, { name: 'Rape', value: 'rape' },
            { name: 'Schoolgirl', value: 'schoolgirl' }, { name: 'Tentacles', value: 'tentacles' }, { name: 'Threesome', value: 'threesome' },
            { name: 'Uncensored', value: 'uncensored' }, { name: 'Yuri', value: 'yuri' }
        ];

        const tags = [
            { name: '3D', value: '3d' }, { name: 'anal', value: 'anal' }, { name: 'ahegao', value: 'ahegao' },
            { name: 'big tits', value: 'big-tits' }, { name: 'blowjob', value: 'blowjob' }, { name: 'cheating', value: 'cheating' },
            { name: 'creampie', value: 'creampie' }, { name: 'cumshot', value: 'cumshot' }, { name: 'deepthroat', value: 'deepthroat' },
            { name: 'futanari', value: 'futanari' }, { name: 'gangbang', value: 'gangbang' }, { name: 'handjob', value: 'handjob' },
            { name: 'hentai', value: 'hentai' }, { name: 'incest', value: 'incest' }, { name: 'loli', value: 'loli' },
            { name: 'milf', value: 'milf' }, { name: 'netorare', value: 'netorare' }, { name: 'paizuri', value: 'paizuri' },
            { name: 'rape', value: 'rape' }, { name: 'rimjob', value: 'rimjob' }, { name: 'schoolgirl', value: 'schoolgirl' },
            { name: 'sex', value: 'sex' }, { name: 'tentacles', value: 'tentacles' }, { name: 'threesome', value: 'threesome' },
            { name: 'uncensored', value: 'uncensored' }, { name: 'yuri', value: 'yuri' }
        ];

        const toOption = (item) => ({ type_name: "SelectOption", name: item.name, value: item.value });

        const categoryOptions = [{ type_name: "SelectOption", name: "Any", value: "" }, ...categories.sort((a, b) => a.name.localeCompare(b.name)).map(toOption)];
        const tagOptions = [{ type_name: "SelectOption", name: "Any", value: "" }, ...tags.sort((a, b) => a.name.localeCompare(b.name)).map(toOption)];
        
        return [
            { type_name: "HeaderFilter", name: "NOTE: Text search overrides filters." },
            { type_name: "HeaderFilter", name: "NOTE: Category/Tag filters override 'Sort by'." },
            { 
                type_name: "SelectFilter", name: "Sort by", state: 0, 
                values: sortOptions.map(s => ({ type_name: "SelectOption", name: s.name, value: s.value })) 
            },
            { type_name: "SelectFilter", name: "Category", state: 0, values: categoryOptions },
            { type_name: "SelectFilter", name: "Tag", state: 0, values: tagOptions },
        ];
    }
}