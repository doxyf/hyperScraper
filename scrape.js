const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const process = require('process');
if(!process.argv[2]) throw new Error(`URL is not defined. (example: node ${__filename.split(/[\\/]/).pop()} http(s)://<address>)`);

var errorCount = 0;
var downloading = false;

const searchSleepTime = 15;
const downloadSleepTime = 15;

var dirsQueue = [process.argv[2]];
var filesQueue = [];
var timeout = null;
var downloadCount = 0;
var downloadsOutOf = 0;

var interval = setInterval(async () => {
    let url = dirsQueue.shift();
    if(!url) return;
    if(!url.endsWith("/")) url = url + "/";

    let urlObject = new URL(url);

    try {

        console.log(`Searching ${urlObject.pathname}...`);
        let r = await axios.get(url);
        resume(urlObject, r);

    } catch (e) {

        errorCount++
        console.log(`[${errorCount}][I][E]`, e.message, "| Maybe scraping too fast?", `${url}`);

    }

}, searchSleepTime);

async function resume(urlObject, r){

    const $ = cheerio.load(r.data);

    let links = [];
    let files = [];

    $('a').each((i, v) => links.push($(v).attr('href')));

    links = links.filter(l => l !== undefined);
    files = links.filter(f => !f.startsWith('?') && !f.endsWith('/') && !f.startsWith('#'));
    links = links.filter(l => !l.startsWith('?') && !l.startsWith("/") && l.endsWith('/') && !l.startsWith('#'));

    if(timeout) clearTimeout(timeout);
    timeout = setTimeout(() => { beginDownload() }, 5000);
    //console.log("timeout reset");


    links.forEach((val, i, arr) => {
        dirsQueue.push(urlObject.href + val);
    });


    //console.log("links", links);
    //console.log("files", files);
    //console.log(filesQueue)

    
    files.forEach((f, i, arr) => {

        let lnk = urlObject.href + f
        try { lnk = decodeURIComponent(urlObject.href + f) } catch (e) {}
        filesQueue.push(lnk);

    });

}

function beginDownload(){
    console.log("<---[ Now downloading", filesQueue.length, "files ]--->");
    clearInterval(interval);
    downloadsOutOf = filesQueue.length;

    process.on("SIGINT", () => {
        const hostStr = "./" + new URL(process.argv[2]).host;

        if(!fs.existsSync(hostStr)) mkdirSync(hostStr);
        fs.writeFileSync(hostStr + "/_scraperInfo.txt", `Interrupted at ${((downloadCount/downloadsOutOf) * 100).toFixed(2)} % of downloads. That's ${downloadCount} out of ${downloadsOutOf} files.`);

        process.exit(0);

    });

    var downloadingInterval = setInterval(() => {
        if(downloading) return;
        if(filesQueue.length == 0) return clearInterval(downloadingInterval);

        let fileUrl = filesQueue.shift();
        download(fileUrl);

    }, downloadSleepTime);
    
};

async function download(lnkStr){
    downloading = true;
    downloadCount++

    let path = lnkStr.split("://")[1];
    let dirPath = path.split('/');
    dirPath.pop();
    dirPath = dirPath.join('/');
    let fileName = path.split('/').pop();

    if(fs.existsSync(path)) return downloading = false;
    if(path.includes('://')) return downloading = false;

    try {

        if(!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
        const { data } = await axios.get(lnkStr, { responseType: "stream" });
        const stream = data.pipe(fs.createWriteStream(path));

        data.on("data", () => writeLine(`Downloading ${fileName} | ${stream.bytesWritten?.toString()} bytes`));
        data.on("close", () => { writeLine(`[${downloadCount}/${downloadsOutOf}] Success: ${fileName} \n`); downloading = false });
    
    } catch (e) {

        errorCount++
        console.log(`[${downloadCount}/${downloadsOutOf}][e${errorCount}]`, e.message, `Failed: ${fileName} | Maybe scraping too fast?`);
        downloading = false;

    }

}

function writeLine(str) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(str);
}