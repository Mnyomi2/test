--- START OF FILE aznude.js ---

const mangayomiSources = [
  {
    "name": "AZNude",
    "id": 458923485,
    "baseUrl": "https://www.aznude.com",
    "lang": "en",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://www.aznude.com",
    "itemType": 1,
    "isNsfw": true,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/aznude.js",
  },
];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  getPreference(key) {
    return new SharedPreferences().get(key);
  }

  // Common headers for requests to the main site
  getHeaders(refererUrl = this.source.baseUrl) {
    return {
      "Referer": refererUrl,
      "Origin": this.source.baseUrl,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    };
  }

  // Helper for making HTTP GET requests and parsing to Document
  async requestDoc(url, referer = this.source.baseUrl) {
    const res = await this.client.get(url, this.getHeaders(referer));
    return new Document(res.body);
  }

  // Helper for making HTTP GET requests and returning raw body
  async requestBody(url, referer = this.source.baseUrl) {
    const res = await this.client.get(url, this.getHeaders(referer));
    return res.body;
  }

  // Helper to ensure URLs are absolute and well-formed
  fixUrl(url) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    return this.source.baseUrl + url;
  }

  // Helper to parse elements into a search result format
  _toSearchResponse(element) {
    const title = element.selectFirst("img")?.attr("title");
    const href = this.fixUrl(element.attr("href"));
    const posterUrl = this.fixUrl(element.selectFirst("img")?.attr("src"));
    const zamanText = element.selectFirst("span.play-icon-active2.video-time")?.text();

    if (!title || !href || !posterUrl) return null;

    // Filter out videos with duration 00:00 to 00:20
    if (zamanText && /^00:(?:[0-1]\d|20)$/.test(zamanText)) {
      return null;
    }

    return { name: title, link: href, imageUrl: posterUrl };
  }

  async getPopular(page) {
    const categories = [
      { url: `${this.source.baseUrl}/browse/videos/trending/`, name: "Trending Videos" },
      { url: `${this.source.baseUrl}/browse/videos/recent/`, name: "New Videos" },
      { url: `${this.source.baseUrl}/browse/videos/popular/`, name: "Popular Videos" },
    ];

    const allHomePageLists = [];

    for (const category of categories) {
      const doc = await this.requestDoc(`${category.url}${page}.html`);
      const items = doc.select("div.col-lg-3 a.video");
      const list = items.map(item => this._toSearchResponse(item)).filter(Boolean);

      // Check for a 'next' page link to determine hasNextPage
      const hasNextPage = doc.selectFirst("li.next a") != null;

      allHomePageLists.push({
        list: list,
        name: category.name,
        hasNextPage: hasNextPage,
      });
    }
    return allHomePageLists;
  }

  async getLatestUpdates(page) {
    // Reusing the "New Videos" category for latest updates
    const url = `${this.source.baseUrl}/browse/videos/recent/${page}.html`;
    const doc = await this.requestDoc(url);
    const items = doc.select("div.col-lg-3 a.video");
    const list = items.map(item => this._toSearchResponse(item)).filter(Boolean);

    // Check for a 'next' page link to determine hasNextPage
    const hasNextPage = doc.selectFirst("li.next a") != null;
    return { list, hasNextPage };
  }

  async search(query, page, filters) { // MProvider search includes page and filters, though API might not use them directly
    const apiUrl = `https://search-aznude.aznude.workers.dev/initial-search?q=${encodeURIComponent(query)}&gender=f&type=null&sortByDate=DESC&dateRange=anytime`;
    // Use the base URL as the referer for the worker API call
    const jsonString = await this.requestBody(apiUrl, this.source.baseUrl);

    const results = [];
    try {
      const searchWrapper = JSON.parse(jsonString);

      // Add Celebs results
      searchWrapper.data.celebs
        .filter(celeb => celeb.url.includes("/view/celeb/"))
        .forEach(celeb => {
          const href = this.fixUrl(celeb.url);
          // Prepend cdn2 domain for celeb thumbs
          const posterUrl = this.fixUrl(`https://cdn2.aznude.com${celeb.thumb}`);
          results.push({
            name: celeb.text,
            link: href,
            imageUrl: posterUrl,
          });
        });

      // Add Videos results
      searchWrapper.data.videos
        .filter(video => video.url.includes("/view/celeb/")) // Filter as per original logic
        .forEach(video => {
          const href = this.fixUrl(video.url);
          const posterUrl = this.fixUrl(video.thumb);
          results.push({ name: video.text, link: href, imageUrl: posterUrl });
        });

      // Add Stories results
      searchWrapper.data.stories
        .filter(story => story.url.includes("/view/celeb/")) // Filter as per original logic
        .forEach(story => {
          const href = this.fixUrl(story.url);
          const posterUrl = this.fixUrl(story.thumb);
          results.push({ name: story.text, link: href, imageUrl: posterUrl });
        });

      console.log(`AZNude: Total search results: ${results.length}`);
      // The search API doesn't provide explicit pagination, so we assume no next page for now.
      return { list: results, hasNextPage: false };

    } catch (e) {
      console.error(`AZNude: JSON parsing error in search: ${e.message}`);
      return { list: [], hasNextPage: false };
    }
  }

  async getDetail(url) {
    const doc = await this.requestDoc(url);

    if (url.includes("/view/celeb/")) {
      // Celebrity page (interpreted as a series-like entry)
      const name = doc.selectFirst("div.col-sm-8 h1")?.text() || "Unknown Celebrity";
      const imageUrl = this.fixUrl(doc.selectFirst("img.img-circle")?.attr("src"));
      const description = `${name} +18`; // Using title as a basic plot/description
      const genre = doc.select("div.col-md-12 h2.video-tags a").map(it => it.text());
      const status = 5; // Status unknown for celebrity page

      const chapters = [];
      // Select all videos associated with the celebrity
      doc.select("div.movie.grid_load").forEach(videoElement => {
        const chapterHref = this.fixUrl(videoElement.selectFirst("a")?.attr("href"));
        const chapterPoster = this.fixUrl(videoElement.selectFirst("img")?.attr("src"));
        const chapterName = videoElement.selectFirst("img")?.attr("title");
        const videoDurationText = videoElement.selectFirst("span.video-time")?.text();

        let runTime = null; // in seconds
        if (videoDurationText) {
          const parts = videoDurationText.split(":").map(Number);
          if (parts.length === 3) { // HH:MM:SS
            runTime = parts[0] * 3600 + parts[1] * 60 + parts[2];
          } else if (parts.length === 2) { // MM:SS
            runTime = parts[0] * 60 + parts[1];
          }
        }

        if (chapterHref && chapterName) {
          chapters.push({
            name: chapterName,
            url: chapterHref,
            imageUrl: chapterPoster,
            runTime: runTime, // Store runtime in seconds
          });
        }
      });

      return {
        name: name,
        imageUrl: imageUrl,
        description: description,
        genre: genre,
        status: status,
        link: url,
        chapters: chapters,
      };

    } else {
      // Single video page (interpreted as a movie-like entry)
      const name = doc.selectFirst("meta[name=title]")?.attr("content") || "Unknown Video";
      const imageUrl = this.fixUrl(doc.selectFirst("link[rel=preload][as=image]")?.attr("href"));
      const description = doc.selectFirst("meta[name=description]")?.attr("content");
      const genre = doc.select("div.col-md-12 h2.video-tags a").map(it => it.text());
      const status = 1; // Assuming a single video is "Finished"

      let duration = null; // in minutes
      if (description) {
        const durationTextMatch = description.match(/\(([^)]* (?:hour|minute|second)s?))\)/);
        if (durationTextMatch && durationTextMatch[1]) {
          const durationParts = durationTextMatch[1];
          const hoursMatch = durationParts.match(/(\d+) hour/);
          const minutesMatch = durationParts.match(/(\d+) minute/);
          const secondsMatch = durationParts.match(/(\d+) second/);

          const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
          const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
          const seconds = secondsMatch ? parseInt(secondsMatch[1]) : 0;

          duration = hours * 60 + minutes + Math.round(seconds / 60);
        }
      }

      return {
        name: name,
        imageUrl: imageUrl,
        description: description,
        genre: genre,
        status: status,
        link: url,
        chapters: [{ name: "Video", url: url }], // A single "chapter" for the video itself
        duration: duration,
      };
    }
  }

  async getVideoList(url) {
    console.log(`AZNude: Loading video links for: ${url}`);
    const doc = await this.requestDoc(url);
    const scriptElements = doc.select("script");
    const videos = [];

    for (const script of scriptElements) {
      const scriptContent = script.html();

      // Look for jwplayer setup with sources and playlist
      if (scriptContent.includes("jwplayer") && scriptContent.includes("setup") && scriptContent.includes("playlist")) {
        const sourcesRegex = /sources:\s*\[\s*(.*?)\s*\]/s; // 's' flag for dotAll to match across lines
        const sourcesMatch = scriptContent.match(sourcesRegex);

        if (sourcesMatch && sourcesMatch[1]) {
          const sourcesContent = sourcesMatch[1];
          // Regex to extract file and label from each source object
          const sourceRegex = /\{\s*file:\s*"([^"]+)",\s*label:\s*"([^"]+)"(?:,\s*default:\s*true)?\s*\}/g;
          let match;

          while ((match = sourceRegex.exec(sourcesContent)) !== null) {
            const videoUrl = match[1];
            const qualityLabel = match[2];

            let qualityValue;
            switch (qualityLabel.toUpperCase()) {
              case "LQ": qualityValue = "240p"; break;
              case "HQ": qualityValue = "480p"; break;
              case "HD": qualityValue = "720p"; break;
              case "FHD": qualityValue = "1080p"; break;
              case "4K": qualityValue = "2160p"; break;
              default: qualityValue = "Unknown"; break;
            }

            videos.push({
              url: videoUrl,
              originalUrl: videoUrl,
              quality: `AZNude - ${qualityValue}`,
              headers: { "Referer": this.source.baseUrl } // Set referer for the video stream
            });
          }
        }
      }
    }

    if (videos.length === 0) {
      throw new Error("No video streams found on the page.");
    }
    return videos;
  }
}