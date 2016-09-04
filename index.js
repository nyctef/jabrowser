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
  reconnect: true,
})

// suggested boilerplate to try and keep connections alive
client.connection.socket.setTimeout(0)
client.connection.socket.setKeepAlive(true, 10000)

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

client.on('offline', function() {
  // TODO: does this mean we should reconnect? or will reconnect:true handle this?
  console.error('xmpp client went offline')
});

['end', 'close', 'error', 'connect', 'reconnect', 'disconnect'].forEach(function(eventName) {
  client.on(eventName, function(arg1, arg2, arg3) {
    console.error('client raised event: '+eventName, arg1, arg2, arg3)
  })
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

// send a message to an xmpp muc room
function sendGroupchatMessage(client, jid, room, message) {
  log(`sending message ${message} to room ${room} from ${jid}`)
  var stanza = groupchatStanza(jid, room, message)
  client.send(stanza)
}

// construct a stanza for sending a message to an xmpp muc room
function groupchatStanza(jid, room, message) {
  return new XmppClient.Stanza('message', {
    type: 'groupchat',
    from: jid.toString(),
    to: room,
  }).c('body').t(message)
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

// list of clients that should receive messages (by spark.id)
var clients = {}

// list of historical messages to send to newly-connecting clients
var historicalMessages = []

// handle incoming data from browsersand route appropriately
function handleIncomingData(data) {
  switch (data.type) {
    case 'outgoing_message': sendGroupchatMessage(client, config.jid, config.room, data.message.message); break;
    default: console.log('unknown message type', data); break;
  }
}

// when a client connects, add it to the list of clients that should receive messages
primus.on('connection', function(spark) {
  log(`we got a connection from ${spark.address.ip}:${spark.address.port} called ${spark.id}`)
  spark.on('data', handleIncomingData)
  clients[spark.id] = spark
  spark.write({type: 'reset_messages'})
  historicalMessages.forEach(function (message) {
    spark.write({type: 'incoming_message', message: message})
  })
})

// when a client disconnects, remove it from the list of clients that should receive messages
primus.on('disconnection', function(spark) {
  log(`we got a disconnection from ${spark.address.ip}:${spark.address.port} called ${spark.id}`)
  delete clients[spark.id]
})

// send some data to all known clients
function sendToClients(type, message) {
  Object.keys(clients).forEach(function(id) {
    var spark = clients[id]
    log(`sending ${type} to ${spark.id}`)
    spark.write({type: type, message: message})
  })
}

// when an incoming message happens, send it to all connected clients
mucEvents.on('incoming_message', function(message) {
  historicalMessages.push(message)
  sendToClients('incoming_message', message)
})
// let's do the same for delayed messages
mucEvents.on('delayed_message', function(message) {
  historicalMessages.push(message)
  sendToClients('incoming_message', message)
})

