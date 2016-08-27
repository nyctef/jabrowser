var EventEmitter = require('events')
var XmppClient = require('node-xmpp-client')
var config = require('./config')
var JID = require('node-xmpp-jid')

var mucxmlns = 'http://jabber.org/protocol/muc'
var log = console.log
var mucEvents = new EventEmitter()

var client = new XmppClient({
  jid: config.jid,
  password: config.password,
})

client.on('online', function(data) {
  var jid = data.jid
  log(`online: connected as ${jid.toString()}`)
  joinRoom(client, jid, config.room, config.roomNick)
})

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

client.on('error', function (err) {
  console.error(err)
  process.exit(1)
})

function joinRoom(client, jid, room, roomNick) {
  log('joining room ' + room + ' with nick ' + roomNick)
  var stanza = joinRoomStanza(jid, room, roomNick)
  //log(stanza)
  client.send(stanza)
}

function joinRoomStanza(jid, room, roomNick) {
  return new XmppClient.Stanza('presence', {
    from: jid.toString(),
    to: `${room}/${roomNick}`
  }).c('x', {xmlns: mucxmlns})
}

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

function handlePresence(stanza) {
  // TODO later
}

mucEvents.on('topic', function(topic) {
  log('topic', topic)
})

mucEvents.on('delayed_message', function(message) {
  log('delayed_message', message)
})

mucEvents.on('incoming_message', function(message) {
  log('incoming_message', message)
})
