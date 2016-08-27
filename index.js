//
// connecting to xmpp and rasing some events
//

var EventEmitter = require('events')
var XmppClient = require('node-xmpp-client')
var config = require('./config')
var JID = require('node-xmpp-jid')

var mucxmlns = 'http://jabber.org/protocol/muc'
var log = console.log
var mucEvents = new EventEmitter()

// start and connect an xmpp client
var client = new XmppClient({
  jid: config.jid,
  password: config.password,
})

// when the xmpp client connects, join to the room we have configured
client.on('online', function(data) {
  var jid = data.jid
  log(`online: connected as ${jid.toString()}`)
  joinRoom(client, jid, config.room, config.roomNick)
})

// when the xmpp client receives some data, figure out how to handle it
client.on('stanza', function(stanza) {
  if (stanza.is('presence')) {
    handlePresence(stanza)
    return
  }
  if (stanza.is('message')) {
    switch(stanza.type) {
      case 'groupchat': 
        handleGroupchat(stanza)
        break
      default:
        log('unrecognised message stanza: ', stanza.toString())
        log(stanza)
        break
    }
    return
  }
})

// if the xmpp client receives an error, print it out and quit
client.on('error', function (err) {
  console.error(err)
  process.exit(1)
})

// join a specific xmpp muc room
function joinRoom(client, jid, room, roomNick) {
  log('joining room ' + room + ' with nick ' + roomNick)
  var stanza = joinRoomStanza(jid, room, roomNick)
  //log(stanza)
  client.send(stanza)
}

// construct a stanza for joining an xmpp muc room
function joinRoomStanza(jid, room, roomNick) {
  return new XmppClient.Stanza('presence', {
    from: jid.toString(),
    to: `${room}/${roomNick}`
  }).c('x', {xmlns: mucxmlns})
}

// handle xmpp muc groupchat messages
function handleGroupchat(stanza) {
  if (stanza.getChild('subject')) {
    mucEvents.emit('topic', {
      topic: stanza.getChild('subject').text()
    })
    return
  }

  if (stanza.getChild('delay')) {
    mucEvents.emit('delayed_message', {
      speaker: JID(stanza.from).resource,
      message: stanza.getChild('body').text(),
      timestamp: stanza.getChild('delay').attrs.stamp,
    })
    return
  }

  mucEvents.emit('incoming_message', {
    speaker: JID(stanza.from).resource,
    message: stanza.getChild('body').text(),
    timestamp: new Date().toISOString(),
  })
}

// handle xmpp presence stanzas
function handlePresence(stanza) {
  // TODO later
}

// make sure mucEvents work properly

mucEvents.on('topic', function(topic) {
  log('topic', topic)
})

mucEvents.on('delayed_message', function(message) {
  log('delayed_message', message)
})

mucEvents.on('incoming_message', function(message) {
  log('incoming_message', message)
})

//
// webserver and websockets
//

var Primus = require('primus')
var http = require('http')
var fs = require('fs')
// create a server that responds with index.html
var server = http.createServer(function(req, res) {
  if (req.url == '/') {
    fs.readFile('./index.html', function(err, content) {
      if (err) {
        console.error(error)
        res.writeHead(500)
        res.end(JSON.stringify(error))
      } else {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end(content, 'utf-8')
      }
    })
  }
})

// listen on port 3333
server.listen(3333)
log('server is listening on :3333')

// create a websockets server
var primus = new Primus(server, {
  transformer: 'engine.io',
})

// when a client makes a websocket connection, start sending it xmpp messages
// TODO: unsubscribe? probably want to make a separate list of sparks
// and manage that independently
primus.on('connection', function(spark) {
  log(`we got a connection from ${spark.address} called ${spark.id}`)
  mucEvents.on('incoming_message', function(message) {
    log(`sending incoming_message to ${spark.id}`)
    spark.write({type: 'incoming_message', message: message})
  })
})

primus.on('disconnection', function(spark) {
  log(`we got a disconnection from ${spark.address} called ${spark.id}`)
})

