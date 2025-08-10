// --- METADATA ---
const mangayomiSources = [{
    "name": "HentaiMama",
    "id": 9876543210,
    "lang": "en",
    "baseUrl": "https://hentaimama.io",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hentaimama.io",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/hentaimama.js"
}];

// --- CLASS ---
class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    // ---------------- HELPERS ----------------
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

    // -------------- POPULAR ANIME ------------
    async getPopular(page) {
        const url = `${this.getBaseUrl()}/advance-search/page/${page}/?submit=Submit&filter=weekly`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const items = doc.select("article.tvshows");
        const list = [];
        for (const el of items) {
            const name = el.selectFirst("div.data h3 a").text.trim();
            const link = el.selectFirst("a").getHref;
            const imageUrl = el.selectFirst("div.poster img").attr("data-src");
            list.push({ name, imageUrl, link });
        }

        const hasNext = doc.selectFirst("div.pagination-wraper div.resppages a") != null;
        return { list, hasNextPage: hasNext };
    }

    // -------------- LATEST UPDATES -----------
    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/tvshows/page/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const items = doc.select("article.tvshows");
        const list = [];
        for (const el of items) {
            const name = el.selectFirst("div.data h3 a").text.trim();
            const link = el.selectFirst("a").getHref;
            const imageUrl = el.selectFirst("div.poster img").attr("data-src");
            list.push({ name, imageUrl, link });
        }

        const hasNext = doc.selectFirst("link[rel=next]") != null;
        return { list, hasNextPage: hasNext };
    }

    // ---------------- SEARCH -----------------
    async search(query, page, filters) {
        // Build parameters exactly like Kotlin source
        let params = "";
        let sortBy = "weekly";
        for (const f of filters) {
            if (f.type_name === "GroupFilter" && f.name === "Genre") {
                for (const g of f.state) {
                    if (g.state) params += `&genres_filter[${encodeURIComponent(g.value)}]=${encodeURIComponent(g.value)}`;
                }
            }
            if (f.type_name === "GroupFilter" && f.name === "Year") {
                for (const y of f.state) {
                    if (y.state) params += `&years_filter[${encodeURIComponent(y.value)}]=${encodeURIComponent(y.value)}`;
                }
            }
            if (f.type_name === "GroupFilter" && f.name === "Producer") {
                for (const p of f.state) {
                    if (p.state) params += `&studios_filter[${encodeURIComponent(p.value)}]=${encodeURIComponent(p.value)}`;
                }
            }
            if (f.type_name === "SelectFilter" && f.name === "Order") {
                sortBy = f.values[f.state].value;
            }
        }

        let url;
        if (query.trim()) {
            // normal text search
            url = `${this.getBaseUrl()}/page/${page}/?s=${encodeURIComponent(query.trim())}`;
        } else {
            // filter search
            url = `${this.getBaseUrl()}/advance-search/page/${page}/?${params}&submit=Submit&filter=${sortBy}`;
        }

        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const items = query.trim() ? doc.select("article") : doc.select("article.tvshows");
        const list = [];
        for (const el of items) {
            let name, link, imageUrl;
            if (query.trim()) {
                // normal search layout
                name = el.selectFirst("div.details > div.title a").text.trim();
                link = el.selectFirst("div.details > div.title a").getHref;
                imageUrl = el.selectFirst("div.image div a img").attr("src");
            } else {
                // filter layout
                name = el.selectFirst("div.data h3 a").text.trim();
                link = el.selectFirst("a").getHref;
                imageUrl = el.selectFirst("div.poster img").attr("data-src");
            }
            list.push({ name, imageUrl, link });
        }

        const hasNext = query.trim()
            ? doc.selectFirst("link[rel=next]") != null
            : doc.selectFirst("div.pagination-wraper div.resppages a") != null;

        return { list, hasNextPage: hasNext };
    }

    // ---------------- DETAILS ----------------
    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const name = doc.selectFirst("#info1 div:nth-child(2) span").text.trim();
        const imageUrl = doc.selectFirst("div.sheader div.poster img").attr("data-src");
        const description = doc.select("#info1 div.wp-content p").text.trim();
        const genre = doc.select("div.sheader div.data div.sgeneros a")
                         .map(g => g.text.trim());
        const author = doc.select("#info1 div:nth-child(3) span div div a")
                          .map(a => a.text.trim()).join(", ");
        const statusText = doc.selectFirst("#info1 div:nth-child(6) span").text.trim();
        const status = statusText === "Ongoing" ? 0 : 1;

        // Episodes
        const eps = [];
        const epElements = doc.select("div.series div.items article");
        for (const el of epElements) {
            const epName = el.selectFirst("div.data h3").text.trim();
            const epUrl = el.selectFirst("div.season_m a").getHref;
            const dateText = el.selectFirst("div.data > span").text.trim();
            const dateUpload = new Date(dateText).valueOf().toString();
            const type = el.selectFirst("div.season_m a span.c").text.trim(); // SUB / DUB
            const epMatch = /Episode ([\d.]+)/.exec(type);
            const episode_number = epMatch ? parseFloat(epMatch[1]) : 1;

            eps.unshift({ name: epName, url: epUrl, dateUpload, scanlator: type, episode_number });
        }

        return { name, imageUrl, description, link: url, status, genre, author, chapters: eps };
    }

    // -------------- VIDEO LIST ---------------
    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        // POST body
        const token = doc.selectFirst("#post_report input:nth-child(5)").attr("value");
        const body = new FormBody()
            .append("action", "get_player_contents")
            .append("a", token);

        const ajax = `${this.getBaseUrl()}/wp-admin/admin-ajax.php`;
        const ajaxRes = await this.client.post(ajax, this.getHeaders(ajax), body);
        const iframeDoc = new Document(ajaxRes.body);

        const html = iframeDoc.body.outerHTML;
        const iframeUrls = html.match(/https?:\/\/[^\s"']+/gi) || [];

        const videoList = [];
        for (const iframeUrl of iframeUrls) {
            const resp = await this.client.get(iframeUrl, this.getHeaders(iframeUrl));
            const txt = resp.body;
            const mp4 = txt.match(/(https?:\/\/[^"\s]+\.mp4[^"\s]*)/i);
            if (!mp4) continue;

            const label = iframeUrl.includes("newr2") ? "Beta"
                        : iframeUrl.includes("new1") ? "Mirror 1"
                        : iframeUrl.includes("new2") ? "Mirror 2"
                        : iframeUrl.includes("new3") ? "Mirror 3"
                        : "Unknown";

            videoList.push({
                url: mp4[1],
                originalUrl: mp4[1],
                quality: label,
                headers: this.getHeaders(mp4[1])
            });
        }

        // Optional quality sort
        const pref = new SharedPreferences().get("preferred_quality");
        if (pref) {
            const idx = videoList.findIndex(v => v.quality.includes(pref));
            if (idx !== -1) {
                const [item] = videoList.splice(idx, 1);
                videoList.unshift(item);
            }
        }

        return videoList;
    }

    // -------------- FILTERS ------------------
    getFilterList() {
        const genres = ["3D","Action","Adventure","Ahegao","Anal","Animal Ears","Beastiality","Blackmail","Blowjob","Bondage","Brainwashed","Bukakke","Cat Girl","Comedy","Cosplay","Creampie","Cross-dressing","Dark Skin","DeepThroat","Demons","Doctor","Double Penatration","Drama","Dubbed","Ecchi","Elf","Eroge","Facesitting","Facial","Fantasy","Female Doctor","Female Teacher","Femdom","Footjob","Futanari","Gangbang","Gore","Gyaru","Harem","Historical","Horny Slut","Housewife","Humiliation","Incest","Inflation","Internal Cumshot","Lactation","Large Breasts","Lolicon","Magical Girls","Maid","Martial Arts","Megane","MILF","Mind Break","Molestation","Non-Japanese","NTR","Nuns","Nurses","Office Ladies","Police","POV","Pregnant","Princess","Public Sex","Rape","Rim job","Romance","Scat","School Girls","Sci-Fi","Shimapan","Short","Shoutacon","Slaves","Sports","Squirting","Stocking","Strap-on","Strapped On","Succubus","Super Power","Supernatural","Swimsuit","Tentacles","Three some","Tits Fuck","Torture","Toys","Train Molestation","Tsundere","Uncensored","Urination","Vampire","Vanilla","Virgins","Widow","X-Ray","Yuri"]
            .map(g => ({ type_name: "CheckBox", name: g, value: g }));

        const years = ["2022","2021","2020","2019","2018","2017","2016","2015","2014","2013","2012","2011","2010","2009","2008","2007","2006","2005","2004","2003","2002","2001","2000","1999","1998","1997","1996","1995","1994","1993","1992","1991","1987"]
            .map(y => ({ type_name: "CheckBox", name: y, value: y }));

        const producers = ["8bit","Actas","Active","AIC","AIC A.S.T.A.","Alice Soft","An DerCen","Angelfish","Animac","AniMan","Animax","Antechinus","APPP","Armor","Arms","Asahi Production","AT-2","Blue Eyes","BOMB! CUTE! BOMB!","BOOTLEG","Bunnywalker","Central Park Media","CherryLips","ChiChinoya","Chippai","ChuChu","Circle Tribute","CLOCKUP","Collaboration Works","Comic Media","Cosmic Ray","Cosmo","Cotton Doll","Cranberry","D3","Daiei","Digital Works","Discovery","Dream Force","Dubbed","Easy Film","Echo","EDGE","Filmlink International","Five Ways","Front Line","Frontier Works","Godoy","Gold Bear","Green Bunny","Himajin Planning","Hokiboshi","Hoods Entertainment","Horipro","Hot Bear","HydraFXX","Innocent Grey","Jam","JapanAnime","King Bee","Kitty Films","Kitty Media","Knack Productions","KSS","Lemon Heart","Lune Pictures","Majin","Marvelous Entertainment","Mary Jane","Media","Media Blasters","Milkshake","Mitsu","Moonstone Cherry","Mousou Senka","MS Pictures","Nihikime no Dozeu","Nur","NuTech Digital","Obtain Future","Office Take Off","OLE-M","Oriental Light and Magic","Oz","Pashmina","Pink Pineapple","Pixy","PoRO","Production I.G","Queen Bee","Sakura Purin Animation","Schoolzone","Selfish","Seven","Shelf","Shinkuukan","Shinyusha","Shouten","Silky’s","Soft Garage","SoftCel Pictures","SPEED","Studio 9 Maiami","Studio Eromatick","Studio Fantasia","Studio Jack","Studio Kyuuma","Studio Matrix","Studio Sign","Studio Tulip","Studio Unicorn","Suzuki Mirano","T-Rex","The Right Stuf International","Toho Company","Top-Marschal","Toranoana","Toshiba Entertainment","Triangle Bitter","Triple X","Union Cho","Valkyria","White Bear","Y.O.U.C","ZIZ Entertainment","Zyc"]
            .map(p => ({ type_name: "CheckBox", name: p, value: p }));

        return [
            { type_name: "HeaderFilter", name: "Ignored if using Text Search" },
            { type_name: "SelectFilter", name: "Order", state: 0, values: [
                { type_name: "SelectOption", name: "Weekly Views", value: "weekly" },
                { type_name: "SelectOption", name: "Monthly Views", value: "monthly" },
                { type_name: "SelectOption", name: "Alltime Views", value: "alltime" },
                { type_name: "SelectOption", name: "A-Z", value: "alphabet" },
                { type_name: "SelectOption", name: "Rating", value: "rating" }
            ]},
            { type_name: "GroupFilter", name: "Genre", state: genres },
            { type_name: "GroupFilter", name: "Year", state: years },
            { type_name: "GroupFilter", name: "Producer", state: producers }
        ];
    }

    // -------------- PREFERENCES --------------
    getSourcePreferences() {
        return [
            {
                key: "preferred_quality",
                listPreference: {
                    title: "Preferred video quality",
                    summary: "Select the quality to be prioritized",
                    valueIndex: 2,
                    entries: ["Mirror 1", "Mirror 2", "Mirror 3", "Beta"],
                    entryValues: ["Mirror 1", "Mirror 2", "Mirror 3", "Beta"]
                }
            }
        ];
    }
}