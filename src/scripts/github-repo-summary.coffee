# Description
#   A Hubot script to count the specified repository commits
#
# Configuration:
#   HUBOT_GITHUB_REPO_SUMMARY_CRON_TIME
#   HUBOT_GITHUB_REPO_SUMMARY_GITHUB_TOKEN
#   HUBOT_GITHUB_REPO_SUMMARY_GOOGLE_EMAIL
#   HUBOT_GITHUB_REPO_SUMMARY_GOOGLE_KEY
#   HUBOT_GITHUB_REPO_SUMMARY_GOOGLE_SHEET_KEY
#   HUBOT_GITHUB_REPO_SUMMARY_ROOM
#
# Commands:
#   None
#
# Author:
#   bouzuya <m@bouzuya.net>
#
{CronJob} = require 'cron'
{Promise} = require 'es6-promise'
GitHub = require 'github'
loadCells = require '../google-sheet'
parseConfig = require 'hubot-config'
moment = require 'moment'

config = parseConfig 'github-repo-summary',
  cronTime: '1 0 0 * * *'
  githubToken: null
  googleEmail: null
  googleKey: null
  googleSheetKey: null
  room: null

loadRepos = (config) ->
  loadCells
    credentials:
      email: config.googleEmail
      key: config.googleKey
    spreadsheetKey: config.googleSheetKey
  .then (cells) ->
    cells
      .filter (i) -> i.title.match(/^A/)
      .filter (i) -> i.content.match(/([^\/]+)\/([^\/]+)/)
      .map (i) -> i.content.match(/([^\/]+)\/([^\/]+)/)
      .map (i) -> user: i[1], repo: i[2]

fetchComments = (user, repo) ->
  new Promise (resolve, reject) ->
    github = new GitHub(version: '3.0.0')
    github.issues.repoComments
      user: user
      repo: repo
      sort: 'created'
      direction: 'desc'
    , (err, data) ->
      if err? then reject(err) else resolve(data)

createComment = (token, user, repo, number, body) ->
  new Promise (resolve, reject) ->
    github = new GitHub(version: '3.0.0')
    github.authenticate(type: 'oauth', token: token)
    github.issues.createComment { user, repo, number, body }, (err, data) ->
      if err? then reject(err) else resolve(data)

listCommits = (token, user, repo, since) ->
  new Promise (resolve, reject) ->
    github = new GitHub(version: '3.0.0')
    github.authenticate(type: 'oauth', token: token)
    github.repos.getCommits { user, repo, since }, (err, data) ->
      if err? then reject(err) else resolve(data)

module.exports = (robot) ->
  repos = []

  watch = ->
    reposString = repos.map((i) -> "#{i.user}/#{i.repo}").join(',')
    robot.logger.info 'hubot-github-repo-summary: watch repos ' + reposString
    promises = repos.map (i) ->
      yesterday = moment().subtract(1, 'days').startOf('day')
      listCommits(config.githubToken, i.user, i.repo, yesterday.format())
      .then (commits) ->
        date = yesterday.format('YYYY-MM-DD')
        count = commits.length
        robot.messageRoom config.room, """
          #{date} #{i.user}/#{i.repo}: #{count} commits
        """
    Promise.all(promises)
    .catch (e) ->
      robot.logger.error e

  loadRepos(config).then (r) ->
    reposString = r.map((i) -> "#{i.user}/#{i.repo}").join(',')
    robot.logger.info 'hubot-github-repo-summary: load repos ' + reposString
    repos = r
  .catch (e) ->
    robot.logger.error e

  new CronJob(config.cronTime, watch, null, true, 'Asia/Tokyo')
