var XmppClient = require('node-xmpp-client')
var config = require('./config')

var mucxmlns = 'http://jabber.org/protocol/muc'

var client = new XmppClient({
  jid: config.jid,
  password: config.password,
})

var log = console.log

client.on('online', function(data) {
  var jid = data.jid
  log(`online: connected as ${jid.toString()}`)
  joinRoom(client, jid, config.room, config.roomNick)
})

client.on('stanza', function(stanza) {
  log('incoming stanza: ', stanza.toString())
})

client.on('error', function (err) {
  console.error(err)
  process.exit(1)
})

function joinRoom(client, jid, room, roomNick) {
  log('joining room ' + room + ' with nick ' + roomNick)
  var stanza = joinRoomStanza(jid, room, roomNick)
  log(stanza)
  client.send(stanza)
}

function joinRoomStanza(jid, room, roomNick) {
  return new XmppClient.Stanza('presence', {
    from: jid.toString(),
    to: `${room}/${roomNick}`
  }).c('x', {xmlns: mucxmlns})
}
