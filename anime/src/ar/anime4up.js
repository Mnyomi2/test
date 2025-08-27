// --- METADATA ---
const mangayomiSources = [{
    "name": "Anime4up",
    "id": 8374956845,
    "lang": "ar",
    "baseUrl": "https://ww.anime4up.rest",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=ww.anime4up.rest",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.5.5",
    "pkgPath": "anime/src/ar/anime4up.js"
}];



// --- CLASS ---
class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    // --- PREFERENCES AND HEADERS ---

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl() + "/",
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }
    
    _getVideoHeaders(refererUrl) {
        const headers = this.getHeaders(refererUrl);
        headers["Referer"] = refererUrl;
        return headers;
    }

    // --- HELPER METHODS ---
    
    _formatQuality(baseQuality, url) {
        const showUrl = this.getPreference("show_video_url_in_quality");
        if (showUrl) {
            return `${baseQuality} - ${url}`;
        }
        return baseQuality;
    }

    getNumericQuality(quality) {
        const q = quality.toLowerCase();
        if (q.includes("fhd") || q.includes("1080")) return "1080p";
        if (q.includes("hd") || q.includes("720")) return "720p";
        if (q.includes("sd") || q.includes("480")) return "480p";
        return "720p"; // Default quality
    }

    // --- CORE METHODS (Popular, Latest, Search, Detail) ---
    // These methods remain the same as they are already working correctly.
    async fetchAndParseCataloguePage(path) {const url=this.getBaseUrl()+path;const res=await this.client.get(url,this.getHeaders(url));const doc=new Document(res.body);const list=[];const items=doc.select(".anime-card-container, div.row.posts-row article");for(const item of items){const linkElement=item.selectFirst("div.anime-card-title h3 a, h3.post-title a");const imageElement=item.selectFirst("img.img-responsive");if(linkElement&&imageElement){const name=linkElement.text.trim();const link=linkElement.getHref.replace(/^https?:\/\/[^\/]+/,'');const imageUrl=imageElement.getSrc;list.push({name,imageUrl,link});}}
    const hasNextPage=doc.selectFirst("ul.pagination li a[href*='page='], a.next.page-numbers")!=null;return{list,hasNextPage};}
    async getPopular(page){const path=`/قائمة-الانمي/page/${page}/`;return this.fetchAndParseCataloguePage(path);}
    async getLatestUpdates(page){const path=`/episode/page/${page}/`;const result=await this.fetchAndParseCataloguePage(path);const fixedList=result.list.map(item=>({...item,link:item.link.replace(/-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-.*$/,"").replace("/episode/","/anime/")}));return{list:fixedList,hasNextPage:result.hasNextPage};}
    async search(query,page,filters){let urlPath;if(query){urlPath=`/?search_param=animes&s=${encodeURIComponent(query)}&paged=${page}`;}else{const sectionFilter=filters.find(f=>f.name==="القسم");const genreFilter=filters.find(f=>f.name==="تصنيف الأنمي");const statusFilter=filters.find(f=>f.name==="حالة الأنمي");const typeFilter=filters.find(f=>f.name==="النوع");const seasonFilter=filters.find(f=>f.name==="الموسم");let basePath="";if(sectionFilter&&sectionFilter.state>0){const value=sectionFilter.values[sectionFilter.state].value;basePath=`/anime-category/${value}/`;}else if(genreFilter&&genreFilter.state>0){const value=genreFilter.values[genreFilter.state].value;basePath=`/anime-genre/${value}/`;}else if(statusFilter&&statusFilter.state>0){const value=statusFilter.values[statusFilter.state].value;basePath=`/anime-status/${value}/`;}else if(typeFilter&&typeFilter.state>0){const value=typeFilter.values[typeFilter.state].value;basePath=`/anime-type/${value}/`;}else if(seasonFilter&&seasonFilter.state>0){const value=seasonFilter.values[seasonFilter.state].value;basePath=`/anime-season/${value}/`;}
    if(basePath){urlPath=`${basePath}?page=${page}`;}else{urlPath=`/قائمة-الانمي/page/${page}/`;}}
    return this.fetchAndParseCataloguePage(urlPath);}
    async getDetail(url){const res=await this.client.get(this.getBaseUrl()+url,this.getHeaders(this.getBaseUrl()+url));const doc=new Document(res.body);const name=doc.selectFirst("h1.anime-details-title").text;const imageUrl=doc.selectFirst("div.anime-thumbnail img.thumbnail").getSrc;const description=doc.selectFirst("p.anime-story").text;const link=url;const statusText=doc.selectFirst("div.anime-info:contains(حالة الأنمي) a")?.text??'';const status={"يعرض الان":0,"مكتمل":1}[statusText]??5;const genre=doc.select("ul.anime-genres > li > a").map(e=>e.text);const chapters=[];const episodeElements=doc.select(".episodes-card-title h3 a");for(const element of episodeElements){chapters.push({name:element.text.trim(),url:element.getHref.replace(/^https?:\/\/[^\/]+/,'')});}
    chapters.reverse();return{name,imageUrl,description,link,status,genre,chapters};}

    // --- VIDEO EXTRACTION ---

    async getVideoList(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders(this.getBaseUrl() + url));
        const doc = new Document(res.body);
        let videos = [];
        const hosterSelection = this.getPreference("hoster_selection") || [];

        const linkElements = doc.select('#episode-servers li a');
        for (const element of linkElements) {
            try {
                let streamUrl = element.attr('data-ep-url');
                if (!streamUrl) continue;

                if (streamUrl.startsWith("//")) {
                    streamUrl = "https:" + streamUrl;
                }
                
                if (streamUrl.includes("vidmoly.to")) {
                    streamUrl = streamUrl.replace("vidmoly.to", "vidmoly.net");
                }

                const qualityText = element.text.trim();
                const numericQuality = this.getNumericQuality(qualityText);
                const serverName = qualityText.split(' - ')[0].trim();
                const finalQualityLabel = `${serverName} - ${numericQuality}`;
                
                // --- Domain Lists for easier matching ---
                const streamwish_domains = ["streamwish", "filelions", "streamvid", "wolfstream", "iplayerhls"];
                const dood_domains = ["dood", "ds2play", "d-s.io"];
                const vidbom_domains = ["vidbom", "vidbam", "vdbtm"];
                const mixdrop_domains = ["mixdrop", "mxdrop"];
                const lulu_domains = ["luluvid", "luluvdoo"];
                const vk_domains = ["vk.com", "vkvideo.ru"];
                const ruby_domains = ["streamruby", "rubyvid"];

                let extractedVideos = [];
                const streamUrlLower = streamUrl.toLowerCase();

                if (dood_domains.some(d => streamUrlLower.includes(d)) && hosterSelection.includes("dood")) {
                    extractedVideos = await this._doodExtractor(streamUrl, `Dood - ${numericQuality}`);
                } else if ((streamUrlLower.includes("ok.ru") || streamUrlLower.includes("odnoklassniki")) && hosterSelection.includes("okru")) {
                    extractedVideos = await this._okruExtractor(streamUrl, `Okru`);
                } else if (streamUrlLower.includes("streamtape") && hosterSelection.includes("streamtape")) {
                    extractedVideos = await this._streamtapeExtractor(streamUrl, `StreamTape - ${numericQuality}`);
                } else if (streamwish_domains.some(d => streamUrlLower.includes(d)) && hosterSelection.includes("streamwish")) {
                    extractedVideos = await this._streamwishExtractor(streamUrl, `${serverName}`);
                } else if (streamUrlLower.includes("uqload") && hosterSelection.includes("uqload")) {
                    extractedVideos = await this._uqloadExtractor(streamUrl, `Uqload - ${numericQuality}`);
                } else if (vidbom_domains.some(d => streamUrlLower.includes(d)) && hosterSelection.includes("vidbom")) {
                    extractedVideos = await this._vidbomExtractor(streamUrl);
                } else if (streamUrlLower.includes("vidmoly") && hosterSelection.includes("vidmoly")) {
                    extractedVideos = await this._vidmolyExtractor(streamUrl, `Vidmoly`);
                } else if (streamUrlLower.includes("filemoon") && hosterSelection.includes("filemoon")) {
                    extractedVideos = await this._filemoonExtractor(streamUrl, `Filemoon`);
                } else if (lulu_domains.some(d => streamUrlLower.includes(d)) && hosterSelection.includes("lulustream")) {
                    extractedVideos = await this._lulustreamExtractor(streamUrl, `Lulustream`);
                } else if (vk_domains.some(d => streamUrlLower.includes(d)) && hosterSelection.includes("vk")) {
                    extractedVideos = await this._vkExtractor(streamUrl, `VK`);
                } else if (mixdrop_domains.some(d => streamUrlLower.includes(d)) && hosterSelection.includes("mixdrop")) {
                    extractedVideos = await this._mixdropExtractor(streamUrl, `MixDrop - ${numericQuality}`);
                } else if (ruby_domains.some(d => streamUrlLower.includes(d)) && hosterSelection.includes("streamruby")) {
                    extractedVideos = await this._streamrubyExtractor(streamUrl, `StreamRuby`);
                } else if (streamUrlLower.includes("upstream.to") && hosterSelection.includes("upstream")) {
                    extractedVideos = await this._upstreamExtractor(streamUrl, `Upstream`);
                } else if (streamUrlLower.includes("mp4upload") && hosterSelection.includes("mp4upload")) {
                     extractedVideos = await this._mp4uploadExtractor(streamUrl, `Mp4upload - ${numericQuality}`);
                } else if (streamUrlLower.includes("voe.sx") && hosterSelection.includes("voe")) {
                     extractedVideos = await this._voeExtractor(streamUrl, `Voe.sx`);
                }

                videos.push(...extractedVideos);
            } catch (e) { /* Ignore errors from a single hoster */ }
        }

        const preferredQuality = this.getPreference("preferred_quality") || "720";
        videos.sort((a, b) => {
            const qualityA = parseInt(a.quality.match(/(\d+)p/)?.[1] || 0);
            const qualityB = parseInt(b.quality.match(/(\d+)p/)?.[1] || 0);
            const isAPreferred = a.quality.includes(preferredQuality);
            const isBPreferred = b.quality.includes(preferredQuality);
            const scoreA = qualityA + (isAPreferred ? 10000 : 0);
            const scoreB = qualityB + (isBPreferred ? 10000 : 0);
            return scoreB - scoreA;
        });
        return videos;
    }
    
    // --- EXTRACTORS ---

    async _parseM3U8(playlistUrl, prefix, headers = {}) {
        const videos = [];
        if (this.getPreference("extract_qualities")) {
            try {
                const playlistContent = (await this.client.get(playlistUrl, headers)).body;
                const lines = playlistContent.split('\n');
                const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.startsWith("#EXT-X-STREAM-INF")) {
                        const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                        let quality = "Unknown";
                        if (resolutionMatch) {
                            quality = resolutionMatch[1].split('x')[1] + "p";
                        }
                        let videoUrl = lines[++i];
                        if (videoUrl && !videoUrl.startsWith('http')) {
                            videoUrl = baseUrl + videoUrl;
                        }
                        if(videoUrl) {
                            videos.push({ url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(`${prefix} ${quality}`, videoUrl), headers });
                        }
                    }
                }
            } catch(e) { /* Fallback */ }
        }
        if (videos.length == 0) {
             videos.push({ url: playlistUrl, originalUrl: playlistUrl, quality: this._formatQuality(`${prefix} Auto (HLS)`, playlistUrl), headers });
        }
        return videos;
    }

    async _okruExtractor(url, prefix = "Okru") {
        const res = await this.client.get(url, this.getHeaders(url));
        const dataOptions = res.body.substringAfter("data-options=\"").substringBefore("\"");
        if (!dataOptions) return [];
        const videoHeaders = this._getVideoHeaders("https://ok.ru/");
        videoHeaders["Origin"] = "https://ok.ru";
        try {
            const json = JSON.parse(dataOptions.replace(/&quot;/g, '"'));
            const metadata = JSON.parse(json.flashvars.metadata);
            const videos = [];
            const getQualityName = (name) => ({ "full": "1080p", "hd": "720p", "sd": "480p", "low": "360p", "lowest": "240p", "mobile": "144p" }[name] || name);
            if (metadata.videos) {
                videos.push(...metadata.videos.map(video => ({
                    url: video.url, originalUrl: video.url, quality: this._formatQuality(`${prefix} ${getQualityName(video.name)}`, video.url), headers: videoHeaders
                })));
            }
            if (metadata.hlsManifestUrl) {
                videos.unshift({
                    url: metadata.hlsManifestUrl, originalUrl: metadata.hlsManifestUrl, quality: this._formatQuality(`${prefix} Auto (HLS)`, metadata.hlsManifestUrl), headers: videoHeaders
                });
            }
            if (videos.length > 1) {
                const autoOption = videos.shift(); videos.reverse(); videos.unshift(autoOption);
            }
            return videos;
        } catch (e) { return []; }
    }
    
    async _mp4uploadExtractor(url, quality) { const res = (await this.client.get(url, this._getVideoHeaders(url))).body; const src = res.match(/player\.src\({[^}]+src:\s*"([^"]+)"/)?.[1]; if (src) return [{ url: src, quality, originalUrl: url, headers: { Referer: url } }]; return []; }
    async _doodExtractor(url, quality) { const res = await this.client.get(url, this._getVideoHeaders(url)); const pass = res.body.substringAfter("/pass_md5/").substringBefore("'"); const api = `https://${new URL(url).hostname}/pass_md5/${pass}`; const videoUrl = (await this.client.get(api, this._getVideoHeaders(url))).body; const finalUrl = `${videoUrl}${Math.random().toString(36).substring(7)}?token=${pass.substring(pass.lastIndexOf('/') + 1)}`; return [{ url: finalUrl, quality, originalUrl: finalUrl, headers: this._getVideoHeaders(url) }]; }
    async _voeExtractor(url, prefix) { const res = await this.client.get(url, this._getVideoHeaders(url)); const hls = res.body.match(/'hls': '([^']+)'/)?.[1]; if (hls) return this._parseM3U8(hls, prefix, this._getVideoHeaders(url)); return []; }
    async _streamtapeExtractor(url, quality) { const res = await this.client.get(url, this.getHeaders(url)); const script = res.body.substringAfter("document.getElementById('robotlink')").substringBefore("</script>"); if (!script) return []; const part1 = script.substringAfter("innerHTML = '").substringBefore("'"); const part2 = script.substringAfter("+ ('xcd").substringBefore("'"); const finalUrl = "https:" + part1 + part2; return [{ url: finalUrl, quality: this._formatQuality(quality, finalUrl), originalUrl: finalUrl, headers: this._getVideoHeaders(url) }]; }
    async _streamwishExtractor(url, prefix) { const res = await this.client.get(url, this.getHeaders(url)); let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>"); if (!script) return []; script = "eval(function(p,a,c,k,e,d)" + script; const unpacked = unpackJs(script); const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1]; if (masterUrl) return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)); return []; }
    async _uqloadExtractor(url, prefix) { const res = await this.client.get(url, this.getHeaders(url)); const src = res.body.substringAfter("sources: [\"").substringBefore("\"]"); if (src) return [{ url: src, quality: this._formatQuality(prefix, src), originalUrl: src, headers: this._getVideoHeaders("https://uqload.to/") }]; return []; }
    async _vidbomExtractor(url) { const res = await this.client.get(url, this.getHeaders(url)); const script = res.body.substringAfter("sources: [").substringBefore("]"); if (!script) return []; const headers = this._getVideoHeaders(url); const sources = script.split('{file:"').slice(1); let allVideos = []; for (const source of sources) { const src = source.substringBefore('"'); if (src.includes(".m3u8")) { allVideos.push(...await this._parseM3U8(src, "VidShare", headers)); } else { const label = "VidShare: " + source.substringAfter('label:"').substringBefore('"'); allVideos.push({ url: src, originalUrl: src, quality: this._formatQuality(label, src), headers }); } } return allVideos; }
    async _vidmolyExtractor(url, prefix) { const res = await this.client.get(url, this._getVideoHeaders(url)); const masterUrl = res.body.match(/file:"([^"]+m3u8)"/)?.[1]; if (masterUrl) return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)); return []; }
    async _filemoonExtractor(url, prefix) { const res = await this.client.get(url, this._getVideoHeaders(url)); let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>"); if (!script) return []; script = "eval(function(p,a,c,k,e,d)" + script; const unpacked = unpackJs(script); const masterUrl = unpacked.match(/file:"([^"]+)"/)?.[1]; if (masterUrl) return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)); return []; }
    async _lulustreamExtractor(url, prefix) { const res = await this.client.get(url, this.getHeaders(url)); const masterUrl = res.body.match(/file:"([^"]+)"/)?.[1]; if (masterUrl) return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)); return []; }
    async _vkExtractor(url, prefix) { const headers = { ...this._getVideoHeaders("https://vk.com/"), "Origin": "https://vk.com" }; const res = await this.client.get(url, headers); const matches = [...res.body.matchAll(/"url(\d+)":"(.*?)"/g)]; return matches.map(m => ({ url: m[2].replace(/\\/g, ''), originalUrl: url, quality: this._formatQuality(`${prefix} ${m[1]}p`, m[2]), headers })).reverse(); }
    async _mixdropExtractor(url, prefix) { const res = await this.client.get(url, this.getHeaders(url)); let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>"); if (!script) return []; script = "eval(function(p,a,c,k,e,d)" + script; const unpacked = unpackJs(script); const videoUrl = "https:" + unpacked.match(/MDCore\.wurl="([^"]+)"/)?.[1]; if (videoUrl) return [{ url: videoUrl, quality: this._formatQuality(prefix, videoUrl), originalUrl: videoUrl, headers: this._getVideoHeaders(url) }]; return []; }
    async _streamrubyExtractor(url, prefix) { const res = await this.client.get(url, this.getHeaders(url)); const masterUrl = res.body.match(/file:\s*"(https[^"]+m3u8)"/)?.[1]; if (masterUrl) return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)); return []; }
    async _upstreamExtractor(url, prefix) { const res = await this.client.get(url, this.getHeaders(url)); let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>"); if (!script) return []; script = "eval(function(p,a,c,k,e,d)" + script; const unpacked = unpackJs(script); const masterUrl = unpacked.match(/hls:\s*"([^"]+)"/)?.[1]; if (masterUrl) return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)); return []; }
    
    // --- FILTERS & PREFERENCES ---

    getFilterList() { const getSlug=(href)=>href.split('/').filter(Boolean).pop();const sections=[{name:'الكل',value:''},{name:'الانمي المترجم',value:getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%aa%d8%b1%d8%ac%d9%85/')},{name:'الانمي المدبلج',value:getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%af%d8%a8%d9%84%d8%ac/')}].map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));const genres=[{name:'الكل',value:''},{name:'أطفال',value:'أطفال'},{name:'أكشن',value:'أكشن'},{name:'إيتشي',value:'إيتشي'},{name:'اثارة',value:'اثارة'},{name:'الحياة العملية',value:'الحياة-العملية'},{name:'العاب',value:'العاب'},{name:'بوليسي',value:'بوليسي'},{name:'تاريخي',value:'تاريخي'},{name:'جنون',value:'جنون'},{name:'جوسي',value:'جوسي'},{name:'حربي',value:'حربي'},{name:'حريم',value:'حريم'},{name:'خارق للعادة',value:'خارق-للعادة'},{name:'خيال علمي',value:'خيال-علمي'},{name:'دراما',value:'دراما'},{name:'رعب',value:'رعب'},{name:'رومانسي',value:'رومانسي'},{name:'رياضي',value:'رياضي'},{name:'ساموراي',value:'ساموراي'},{name:'سباق',value:'سباق'},{name:'سحر',value:'سحر'},{name:'سينين',value:'سينين'},{name:'شريحة من الحياة',value:'شريحة-من-الحياة'},{name:'شوجو',value:'شوجو'},{name:'شوجو اَي',value:'شوجو-اَي'},{name:'شونين',value:'شونين'},{name:'شونين اي',value:'شونين-اي'},{name:'شياطين',value:'شياطين'},{name:'طبي',value:'طبي'},{name:'غموض',value:'غموض'},{name:'فضائي',value:'فضائي'},{name:'فنتازيا',value:'فنتازيا'},{name:'فنون تعبيرية',value:'فنون-تعبيرية'},{name:'فنون قتالية',value:'فنون-قتالية'},{name:'قوى خارقة',value:'قوى-خارقة'},{name:'كوميدي',value:'كوميدي'},{name:'مأكولات',value:'مأكولات'},{name:'محاكاة ساخرة',value:'محاكاة-ساخرة'},{name:'مدرسي',value:'مدرسي'},{name:'مصاصي دماء',value:'مصاصي-دماء'},{name:'مغامرات',value:'مغامرات'},{name:'موسيقي',value:'موسيقي'},{name:'ميكا',value:'ميكا'},{name:'نفسي',value:'نفسي'},].map(g=>({type_name:"SelectOption",name:g.name,value:encodeURIComponent(g.value)}));const statuses=[{name:'الكل',value:''},{name:'لم يعرض بعد',value:getSlug('https://ww.anime4up.rest/anime-status/%d9%84%d9%85-%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a8%d8%b9%d8%af/')},{name:'مكتمل',value:'complete'},{name:'يعرض الان',value:getSlug('https://ww.anime4up.rest/anime-status/%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a7%d9%84%d8%a7%d9%86-1/')}].map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));const types=[{name:'الكل',value:''},{name:'Movie',value:'movie-3'},{name:'ONA',value:'ona1'},{name:'OVA',value:'ova1'},{name:'Special',value:'special1'},{name:'TV',value:'tv2'}].map(t=>({type_name:"SelectOption",name:t.name,value:t.value}));const seasons=[{name:'الكل',value:'',sortKey:'9999'}];const currentYear=new Date().getFullYear();const seasonMap={'spring':'ربيع','summer':'صيف','fall':'خريف','winter':'شتاء'};for(let year=currentYear+2;year>=2000;year--){Object.entries(seasonMap).forEach(([eng,arb],index)=>{const seasonSlug=`${arb}-${year}`;seasons.push({name:`${arb} ${year}`,value:encodeURIComponent(seasonSlug),sortKey:`${year}-${4-index}`});});}
    const seasonOptions=seasons.sort((a,b)=>b.sortKey.localeCompare(a.sortKey)).map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));return[{type_name:"HeaderFilter",name:"ملاحظة: سيتم تجاهل الفلاتر في حال البحث بالاسم."},{type_name:"SelectFilter",name:"القسم",state:0,values:sections},{type_name:"SelectFilter",name:"تصنيف الأنمي",state:0,values:genres},{type_name:"SelectFilter",name:"حالة الأنمي",state:0,values:statuses},{type_name:"SelectFilter",name:"النوع",state:0,values:types},{type_name:"SelectFilter",name:"الموسم",state:0,values:seasonOptions},]; }

    getSourcePreferences() {
        return [
            {
                key: "override_base_url",
                editTextPreference: { title: "تجاوز عنوان URL الأساسي", summary: "استخدم دومين مختلف للمصدر", value: this.source.baseUrl, dialogTitle: "أدخل عنوان URL الأساسي الجديد", dialogMessage: "الإفتراضي: " + this.source.baseUrl }
            }, 
            {
                key: "preferred_quality",
                listPreference: { title: "الجودة المفضلة", summary: "اختر الجودة التي سيتم اختيارها تلقائيا", valueIndex: 1, entries: ["1080p", "720p", "480p", "360p"], entryValues: ["1080", "720", "480", "360"] }
            }, 
            {
                key: "hoster_selection",
                multiSelectListPreference: {
                    title: "اختر السيرفرات", summary: "اختر السيرفرات التي تريد ان تظهر",
                    entries: ["DoodStream", "Okru", "StreamTape", "StreamWish & Variants", "Uqload", "VidBom/VidShare", "Vidmoly", "Filemoon", "Lulustream", "VK", "MixDrop", "StreamRuby", "Upstream", "Mp4upload", "Voe.sx"],
                    entryValues: ["dood", "okru", "streamtape", "streamwish", "uqload", "vidbom", "vidmoly", "filemoon", "lulustream", "vk", "mixdrop", "streamruby", "upstream", "mp4upload", "voe"],
                    values: ["dood", "okru", "streamtape", "streamwish", "uqload", "vidbom", "vidmoly", "filemoon", "lulustream", "vk", "mixdrop", "streamruby", "upstream", "mp4upload", "voe"],
                }
            },
            {
                key: "extract_qualities",
                switchPreferenceCompat: { title: "استخراج الجودات المتعددة (HLS)", summary: "عند تفعيله، سيقوم بجلب جميع الجودات المتاحة من السيرفرات الداعمة", value: true }
            },
            {
                key: "show_video_url_in_quality",
                switchPreferenceCompat: { title: "إظهار رابط الفيديو", summary: "عرض رابط الفيديو النهائي بجانب اسم الجودة", value: false }
            }
        ];
    }
}
