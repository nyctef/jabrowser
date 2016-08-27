var XmppClient = require('node-xmpp-client')
var config = require('./config')

var client = new XmppClient({
  jid: config.jid,
  password: config.password,
})

var log = console.log

client.on('online', function() {
  log('online')
})

client.on('stanza', function(stanza) {
  log('incoming stanza: ', stanza.toString())
})
