'use strict';



// Dependencies
//
var assert        = require('assert'),
    chassis       = require('../../../index'),
    redis         = require('redis'),
    client        = redis.createClient(),
    id            = '12093213890nj98d',
    secondId      = '12033ei12ksas1df',
    channelName   = 'boxes',
    m1Received    = false,
    m2Received    = false;

var socket = {
    id: id,
    send: function (data) {
      m1Received = data;
    }
  };

var secondSocket = {
  id: secondId,
  send: function (data) {
    m2Received = data;
  }
};

chassis.loadLibraries();


describe('pubsub', function(){

  before(function (done) {

    client.del('chassis_'+'boxes', function (err, res) {
      chassis.pool.getSockets(function(err,sockets){
        var keyLength = Object.keys(sockets).length;
        var i = 0;
        if (keyLength === 0) return done();
        for (var socket in sockets){
          chassis.pool.removeSocket(socket, function (err) {
            i++;
            if (i == keyLength-1) {done();}
          });
        }
      });
    });

  });

  describe('#subscribe', function(){

    before(function (done) {
      
      // This in itself a test of the eventEmitter, because
      // if the event isn't emitted, then the done() function
      // won't be called, and thus the 
      var called = false;
      chassis.eventHandler.on('subscribe', function(channel, subscriber){
        if (!called) {
          called = true;
          assert.equal(channel, channelName);
          assert.equal(subscriber, id);
          done();
        }
      });

      chassis.pool.addSocket(socket, function (err) {
        chassis.pubsub.subscribe(channelName, socket.id, function (err) {
        });
      });

    });
    
    it('should add the channel to the socket', function (done) {
      chassis.pool.getSocket(id, function(err, returnedSocket){
        assert.equal(returnedSocket.channels.length, 1);
        assert.equal(returnedSocket.channels[0], channelName);
        done();
      });
    });

    it('should add the socket to the channel\'s Redis set of subscribed sockets', function (done) {
      client.smembers('chassis_' + channelName, function (err, members) {
        assert.equal(members.length, 1);
        assert.equal(members[0], id);
        done();
      });
    });
    
  });

  describe('#publish', function () {

    before(function (done) {

      chassis.pool.addSocket(socket, function (err) {
        chassis.pubsub.subscribe(channelName, socket.id, function (err) {
          chassis.pool.addSocket(secondSocket, function (err) {
            chassis.pubsub.subscribe(channelName, secondSocket.id, done);
          });
        });
      });

    });

    it('should send the data to the subscribers of that channel', function (done) {
      var data    = {message: 'Hello Mars'};

      chassis.pubsub.publish(channelName, id, data, function (err) {
        // We have to delay the check by a few ms for Redis
        // roundtrip
        setTimeout(function(){
          assert.equal(m1Received, m2Received);
          assert(m1Received);
          assert(m2Received);
          var message = JSON.parse(m1Received);
          assert.deepEqual(message.subscriber, id);
          assert.deepEqual(message.channelName, channelName);
          assert.deepEqual(message.data, data);
          done();
        },10);
      });
    });

  });

  describe('#unsubscribe', function () {

    it('should remove a subscriber from the channel', function (done) {
      m1Received = false;
      m2Received = false;
      var error  = new Error('Event not emitted');

      chassis.eventHandler.on('unsubscribe', function (chnlName, subscriber) {
        assert.equal(chnlName, channelName);
        assert.equal(subscriber, secondId);
        error = null;
      });

      chassis.pubsub.unsubscribe(channelName,secondId, function (err) {
        chassis.pool.getSocket(secondId, function (err, socket) {
          assert.deepEqual(socket.channels,[]);
          client.smembers('chassis_' + channelName, function (err,members) {
            assert.equal(members.indexOf(secondId),-1);
            var data = {message: 'Hello Venus'};
            chassis.pubsub.publish(channelName, id, data, function (err) {
              setTimeout(function(){
                assert(m1Received);
                assert(!m2Received);
                done(error);
              },10);
            });
          });
        });
      });
    });

  });

});