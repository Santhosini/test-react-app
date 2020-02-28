const puppeteer = require('puppeteer');
const chromeLauncher = require('chrome-launcher');
const lighthouse = require('lighthouse');
const github = require('@actions/github');
const core = require('@actions/core');
const fetch = require('node-fetch');

let { payload, actor } = github.context;
let { number } = payload || {};

// const inputSecret = core.getInput('secret');
// console.log('inputSecret', inputSecret)

// const reponame = payload.head.repo.name;

const { secret, surgeUrl } = process.env;

const WIDGET_PERFORMANCE_TITLE = 'Widget Performance measurement';

let owner =  "";
let repo = "";



const TRACK_STATUS = {
  fcp: 'first-contentful-paint',
  fmp: 'first-meaningful-paint',
  si: 'speed-index',
  eil: 'estimated-input-latency',
  fid: 'max-potential-fid',
  fci: 'first-cpu-idle',
  tbl: 'total-blocking-time',
  interactive: 'interactive',
  bootupTime: 'bootup-time',
  networkRequest: 'network-requests',
  totalByteWeights: 'total-byte-weight'
};

const TRACK_NEWTWORK_REQUEST = 'network-requests';

const OUR_WIDGET_JS_URL_START = 'https://widget.freshworks.com/widgets/';

// const SITE_URL = 'http://helpwdiegt-performance.surge.sh/';

const SHOW_EXCLUDED_MEASUREMENT_DATA_IN_COMMENT = [
  'excludeNavigationFcp',
  'excludeNavigationFmp',
  'excludeNavigationFci',
  'excludeNavigationInteractive',
  'si',
  'fid',
  'tbl',
  'eil',
  'bootupTime'
];

const getWidgetStartTime = (items) => {
  let networkRequests = items && items[TRACK_NEWTWORK_REQUEST];
  return networkRequests && networkRequests.details.items.find((item) => {
    return item.url.indexOf(OUR_WIDGET_JS_URL_START) > -1
  });
};

const isEmpty = (value) => {
  value === null && value !== undefined;
};

function millisToSeconds(millis, decimal = 2) {
  if (isEmpty(millis)) return null;
  return (millis / 1000).toFixed(decimal);
}

const getData = (item, type, startTime = 0) => {
  let { id, title, description, numericValue, details } = item.audits[TRACK_STATUS[type]] || {};
  return {
    id,
    title,
    description,
    time: !isEmpty(startTime) && !isEmpty(numericValue) ? millisToSeconds(numericValue - startTime) : numericValue,
    details
  }
};

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}



function createCommentString(metrics) {
  let { report, totalByteWeights } = metrics;
  let comment = `#### ${WIDGET_PERFORMANCE_TITLE}:
Widget Measurement Report is taken using lighthouse
| Measurement | Time (seconds) |
| :--- |  :---: | \n`;
  SHOW_EXCLUDED_MEASUREMENT_DATA_IN_COMMENT.forEach(item => {
    comment += `| ${report[item].title} | ${report[item].time} | \n`
  });

  if (totalByteWeights.length > 0) {
    comment += `#### Total Weights:
| URL | Size |
| :--- |  :---: | \n`;
    totalByteWeights.forEach(totalByteWeight => {
      comment += `| [${totalByteWeight.url}](${totalByteWeight.url}) | ${totalByteWeight.size} | \n`
    });
  }

  return comment;
}

function createNewComment(comment) {
  const { data } = octokit.issues.createComment({
    owner,
    repo,
    issue_number: 3,
    body: comment,
  }).then(data => console.log('comment added')).catch(err => {
    console.log('octokit issue create comment error', err);
    process.exit();
  });
}

function updateComment(comment) {
  octokit.issues.updateComment({
    owner,
    repo,
    comment_id: 590196289,
    body: comment
  }).then(data => console.log('comment added')).catch(err => {
    console.log('octokit issue create comment error', err);
    process.exit();
  });
}

function postResultComment (comment) {
  const octokit = new github.GitHub(secret);
  // console.log('test github context', JSON.stringify(github.context, null, 4))
  console.log('test github context payload', JSON.stringify(github.context.payload, null, 4))
  // octokit.issues.listComments({
  //   owner,
  //   repo,
  //   issue_number: 3
  // }).then((result) => {
  //   console.log('success listCommentsIssue 3', result)
  //   let { data } = result;
  //   console.log('data.length', data.length);
  //   if (data && data.length) {
  //     let filteredData = data.filter(comment => {
  //       return comment.body.indexOf(WIDGET_PERFORMANCE_TITLE) != -1;
  //     });
  //     console.log('filteredData', filteredData)
  //   }
  // }).catch(e => console.log('error listCommentsIssue', e));
  if (github.context.payload.pull_request.comments_url && secret) {
    fetch(github.context.payload.pull_request.comments_url, {
      method: 'post',
      body: JSON.stringify({
        body: comment,
      }),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`,
      },
    }).then(data => console.log('success upload', data)).catch(e => console.log('error listCommentsIssue', e));
  }
  
}

function getWidgetMetrics(results) {
  let widgetScript = getWidgetStartTime(results && results.audits);
  let scriptStartTime = widgetScript && widgetScript.startTime;
  let report = {
    widgetRequestScriptStartTime: millisToSeconds(scriptStartTime),
    userAgent: results.userAgent,
    fcp: getData(results, 'fcp'),
    excludeNavigationFcp: getData(results, 'fcp', scriptStartTime),
    fmp: getData(results, 'fmp'),
    excludeNavigationFmp: getData(results, 'fmp', scriptStartTime),
    si: getData(results, 'si'), // Speed Index shows how quickly the contents of a page are visibly populated. and calcuted using frames
    fci: getData(results, 'fci'), // minimal first interactive
    excludeNavigationFci: getData(results, 'fci', scriptStartTime), // minimal first interactive
    fid: getData(results, 'fid'),
    eil: getData(results, 'eil'),
    tbl: getData(results, 'tbl'), // Sum of all time periods between FCP and Time to Interactive
    interactive: getData(results, 'interactive'),
    excludeNavigationInteractive: getData(results, 'interactive', scriptStartTime),
    bootupTime: getData(results, 'bootupTime'),
    networkRequest: getData(results, 'networkRequest'),
    totalByteWeights: getData(results, 'totalByteWeights')
  };
  let widgetPerformance  = {
    widgetRequestScriptStartTime: scriptStartTime,
    siteUrl: surgeUrl,
    userAgent: report.userAgent,
    fcp: report.fcp.time,
    excludeNavigationFcp: report.excludeNavigationFcp.time,
    fmp: report.fmp.time,
    excludeNavigationFmp: report.excludeNavigationFmp.time,
    fci: report.fci.time,
    excludeNavigationFci: report.excludeNavigationFci.time,
    si: report.si.time,
    fid: report.fid.time,
    tbl: report.tbl.time,
    interactive: report.interactive.time,
    excludeNavigationInteractive: report.excludeNavigationInteractive.time,
    bootupTime: report.bootupTime.time,
    eil: report.eil.time
  };
  
  let networkRequest = report.networkRequest.details.items.filter((item) => !item.url.includes(surgeUrl));
  
  let widgetNetworkRequests = networkRequest.map((item) => {
    return {
      url: item.url,
      duration: millisToSeconds(item.endTime - item.startTime),
      mimeType: item.mimeType,
      resourceType: item.resourceType,
      resourceSize: item.resourceSize,
      resourceSizeValue: formatBytes(item.resourceSize),
      transferSize: item.transferSize,
      transferSizeValue: formatBytes(item.transferSize),
    }
  });

  const excludeSiteUrlByteWeights = report.totalByteWeights.details.items.filter((item) => !item.url.includes(surgeUrl));
  const totalByteWeights = excludeSiteUrlByteWeights.map((item) => {
    return {
      url: item.url,
      totalBytes: item.totalBytes,
      size: formatBytes(item.totalBytes)
    }
  });

  const bootUpTimeDurations = report.bootupTime.details.items.map(item => {
    return {
      url: item.url,
      totalcpuTime: millisToSeconds(item.total, 2),
      scripting: millisToSeconds(item.scripting, 2),
      scriptParseCompile: millisToSeconds(item.scriptParseCompile, 2)
    }
  });
  return {
    report,
    widgetPerformance,
    widgetNetworkRequests,
    totalByteWeights,
    bootUpTimeDurations
  }
}

(async() => {

  const chrome = await chromeLauncher.launch({
    port: 9222,
    logLevel: 'silent',
    chromeFlags: ['--headless', '--disable-gpu'],
  });

  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
  });

  const opts = {
    onlyCategories: ['performance'],
    throttlingMethod: "provided"
  };

  opts.port = (new URL(browser.wsEndpoint())).port;
  const result = await lighthouse(surgeUrl, opts).then(data => data.lhr).catch(e => {
    console.log('lighthouse error:', e);
    process.exit();
  });
  let metrics = getWidgetMetrics(result);
 
  let comment = createCommentString(metrics);
  console.log('Comment string');
  console.log(comment);
  postResultComment(comment);
  await browser.close();
})();
