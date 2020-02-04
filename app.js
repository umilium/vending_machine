const WebSocketServer = require('ws').Server
const fs = require('fs')
const http = require('http')
const template = 'index.html'
const port = 8080
let connects = []

const inputCashFilePath = './dat/input_cash.dat'
const collectFilePath = './dat/collect.dat'
const changeFilePath = './dat/change.dat'

const index = (template, req, res) => {
  fs.stat(template, (err, stats) => {
    if (err) return errorHandler(err)
    if (!stats.isFile()) return errorHandler('not file')

    fs.readFile(template, 'utf-8', (err, data) => {
      if (err) return errorHandler(err)

      res.writeHead(200, {
        'Content-Type': 'text/html'
      })
      res.write(data)
      res.end()
      log(`raed file and pirnt: ${template}`)
    })
  })
}

const errorHandler = (res, err) => {
  res.writeHead(500, {
    'Content-Type': 'text/plain'
  })
  res.end(err)
  log(err)
}

const httpServer = (onRequest) => {
  const _server = http.createServer()

  _server.on('request', (req, res) => {
    log('httpServer on request')
    if (typeof onRequest === 'function') {
      onRequest(req, res)
    }
  })

  _server.on('close', () => {
    log('httpServer closing')
  })

  return _server
}

const server = httpServer((req, res) => {
  index(template, req, res)
})

const wSServer = new WebSocketServer({
  "server": server,
  "path": '/websocket',
})

const broadcast = (message) => {
  connects.forEach((socket, i) => {
    socket.send(message)
  })
}

const log = (str) => {
  console.log(`${(new Date).toString()} "${str}"`)
}

wSServer.on('connection', (ws) => {
  log("WebSocketServer connected")

  // 配列にソケットを格納
  connects.push(ws)

  // 一定時間おきに入金データをチェックし、ブラウザ側に送信
  ;(async () => {
    let cnt = 0

    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1000))

      let fileContents = fs.readFileSync(inputCashFilePath, 'utf-8').trim()
      fileContents = fileContents === '' ? null : fileContents.split("\n").map(c => parseInt(c))

      broadcast(JSON.stringify({cash: fileContents}))
    }
  })()

  ws.on('message', (message) => {
    log(`received: ${message}`)

    const received = JSON.parse(message)

    if (received.action === 'order') {
      // 入金額（硬貨・紙幣単位）
      const inputCashUnits = received.collects
      // 釣り銭（硬貨・紙幣単位）
      const changeUnits = received.changes

      // 入金データ取得
      let collect = JSON.parse(fs.readFileSync(collectFilePath, 'utf-8'))
      // 釣り銭データ取得
      let change = JSON.parse(fs.readFileSync(changeFilePath, 'utf-8'))

      // 今回入金された硬貨・紙幣を入金データに加算
      Object.keys(collect).forEach((k) => {
        const unit = inputCashUnits[k]
        collect[k] += (unit ? unit : 0)
      });
      // 釣り銭分の硬貨・紙幣を入金データより減算
      Object.keys(collect).forEach((k) => {
        const unit = changeUnits[k]
        collect[k] -= (unit ? unit : 0)
      });
      // 釣り銭（硬貨・紙幣）を釣り銭データに加算
      Object.keys(change).forEach((k) => {
        const unit = changeUnits[k]
        change[k] += (unit ? unit : 0)
      });

      // 入金データファイルに書き込み
      fs.writeFile(collectFilePath, JSON.stringify(collect), (error, data) => {
        if (error) console.log(err)
      });
      // 釣り銭データファイルに書き込み
      fs.writeFile(changeFilePath, JSON.stringify(change), (error, data) => {
        if (error) console.log(err)
      });
      // 入金データをカラにする
      fs.writeFile(inputCashFilePath, '', (error, data) => {
        if (error) console.log(err)
      });
    }
  })

  ws.on('close', () => {
    log('stopping client send "close"')

    // 接続切れのソケットを配列から除外
    connects = connects.filter((conn, i) => {
      return (conn === ws) ? false : true
    })
  })
})

server.listen(port)
log(`Server Start on port: ${port}`)
