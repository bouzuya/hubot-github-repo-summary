// Description
//   A Hubot script to count the specified repository commits
//
// Configuration:
//   HUBOT_GITHUB_REPO_SUMMARY_CRON_TIME
//   HUBOT_GITHUB_REPO_SUMMARY_GITHUB_TOKEN
//   HUBOT_GITHUB_REPO_SUMMARY_GOOGLE_EMAIL
//   HUBOT_GITHUB_REPO_SUMMARY_GOOGLE_KEY
//   HUBOT_GITHUB_REPO_SUMMARY_GOOGLE_SHEET_KEY
//   HUBOT_GITHUB_REPO_SUMMARY_ROOM
//
// Commands:
//   None
//
// Author:
//   bouzuya <m@bouzuya.net>
//
var CronJob, GitHub, Promise, config, createComment, fetchComments, listCommits, loadCells, loadRepos, moment, parseConfig;

CronJob = require('cron').CronJob;

Promise = require('es6-promise').Promise;

GitHub = require('github');

loadCells = require('../google-sheet');

parseConfig = require('hubot-config');

moment = require('moment');

config = parseConfig('github-repo-summary', {
  cronTime: '1 0 0 * * *',
  githubToken: null,
  googleEmail: null,
  googleKey: null,
  googleSheetKey: null,
  room: null
});

loadRepos = function(config) {
  return loadCells({
    credentials: {
      email: config.googleEmail,
      key: config.googleKey
    },
    spreadsheetKey: config.googleSheetKey
  }).then(function(cells) {
    return cells.filter(function(i) {
      return i.title.match(/^A/);
    }).filter(function(i) {
      return i.content.match(/([^\/]+)\/([^\/]+)/);
    }).map(function(i) {
      return i.content.match(/([^\/]+)\/([^\/]+)/);
    }).map(function(i) {
      return {
        user: i[1],
        repo: i[2]
      };
    });
  });
};

fetchComments = function(user, repo) {
  return new Promise(function(resolve, reject) {
    var github;
    github = new GitHub({
      version: '3.0.0'
    });
    return github.issues.repoComments({
      user: user,
      repo: repo,
      sort: 'created',
      direction: 'desc'
    }, function(err, data) {
      if (err != null) {
        return reject(err);
      } else {
        return resolve(data);
      }
    });
  });
};

createComment = function(token, user, repo, number, body) {
  return new Promise(function(resolve, reject) {
    var github;
    github = new GitHub({
      version: '3.0.0'
    });
    github.authenticate({
      type: 'oauth',
      token: token
    });
    return github.issues.createComment({
      user: user,
      repo: repo,
      number: number,
      body: body
    }, function(err, data) {
      if (err != null) {
        return reject(err);
      } else {
        return resolve(data);
      }
    });
  });
};

listCommits = function(token, user, repo, since) {
  return new Promise(function(resolve, reject) {
    var github;
    github = new GitHub({
      version: '3.0.0'
    });
    github.authenticate({
      type: 'oauth',
      token: token
    });
    return github.repos.getCommits({
      user: user,
      repo: repo,
      since: since
    }, function(err, data) {
      if (err != null) {
        return reject(err);
      } else {
        return resolve(data);
      }
    });
  });
};

module.exports = function(robot) {
  var repos, watch;
  repos = [];
  watch = function() {
    var promises, reposString;
    reposString = repos.map(function(i) {
      return "" + i.user + "/" + i.repo;
    }).join(',');
    robot.logger.info('hubot-github-repo-summary: watch repos ' + reposString);
    promises = repos.map(function(i) {
      var yesterday;
      yesterday = moment().subtract(1, 'days').startOf('day');
      return listCommits(config.githubToken, i.user, i.repo, yesterday.format()).then(function(commits) {
        var count, date;
        date = yesterday.format('YYYY-MM-DD');
        count = commits.length;
        return robot.messageRoom(config.room, "" + date + " " + i.user + "/" + i.repo + ": " + count + " commits");
      });
    });
    return Promise.all(promises)["catch"](function(e) {
      return robot.logger.error(e);
    });
  };
  loadRepos(config).then(function(r) {
    var reposString;
    reposString = r.map(function(i) {
      return "" + i.user + "/" + i.repo;
    }).join(',');
    robot.logger.info('hubot-github-repo-summary: load repos ' + reposString);
    return repos = r;
  })["catch"](function(e) {
    return robot.logger.error(e);
  });
  return new CronJob(config.cronTime, watch, null, true, 'Asia/Tokyo');
};
