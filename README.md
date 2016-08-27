A small node app that connects to a jabber groupchat and displays it as a simple webpage (so that, for example, it can be used from a steam overlay without alt-tabbing out of a game)

**Note: this is NOT SECURE. There is no authentication, so this makes a jabber room visible to anyone who can see the server**

Getting started
- copy `config.example.js` to `config.js` and enter the details of the jabber room you want to connect to
- `npm install` to fetch dependencies
- `node index.js` to start running
- browse to `localhost:3333` to see the chat
