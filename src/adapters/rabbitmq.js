/* globals Adapter, Routes, Resources */
import uuid from 'uuid';
import Promise from 'bluebird';
import amqp from 'amqplib';
import _ from 'lodash';
import debug from 'debug';

const adapter = {};
const logger = debug('rabbitmq');

class RabbitMQ {

  /**
   * Rabbit application constructor
   * @param {object} channel
   */
  constructor(connection, channel) {
    this.channel = channel;
    this.connection = connection;

    this.channel.prefetch(1);
  }

  /**
   * Creates a listener for rabbit based requests
   * @param {string} route
   * @param {function} event
   */
  async subscribe(route, event) {
    await this.channel.assertQueue(route, { durable: true, exclusive: false });
    this.channel.consume(route, async (request) => {
      let buffer;

      try {
        const response = await event(JSON.parse(request.content.toString()));
        buffer = (response) ?
          new Buffer(JSON.stringify({ code: 'success', body: response })) :
          new Buffer(JSON.stringify({ code: 'success' }));
      } catch (err) {
        logger(err);
        buffer = new Buffer(JSON.stringify({ code: 'invalid_request', message: err.message }));
      }

      this.channel.sendToQueue(
        request.properties.replyTo, buffer,
        { correlationId: request.properties.correlationId },
      );

      this.channel.ack(request);
    });
  }

  async publish(route, request) {
    const id = uuid.v4();
    const callback = await this.channel.assertQueue('', { exclusive: true });

    await this.channel.assertQueue(route, { durable: true });
    this.channel.sendToQueue(
      route,
      new Buffer(JSON.stringify({ body: request })),
      { correlationId: id, replyTo: callback.queue },
    );

    const response = await new Promise((resolve) => {
      this.channel.consume(callback.queue, (message) => {
        if (message.properties.correlationId === id) {
          resolve(JSON.parse(message.content.toString()));
        }
      }, { noAck: true });
    });

    if (response.code === 'invalid_request') throw new Error(response.message);

    return response;
  }

  close() { this.connection.close(); }
}

adapter.start = async () => {
  try {
    const { RABBIT_HOST, RABBIT_VHOST, RABBIT_USER, RABBIT_PASSWORD } = process.env;
    const routes = Routes.filter(route => route.type === 'amqp');
    const rabbit = await amqp.connect(`amqp://${RABBIT_USER}:${RABBIT_PASSWORD}@${RABBIT_HOST}/${RABBIT_VHOST}`);
    const channel = await rabbit.createChannel();

    Adapter.RabbitMQ = new RabbitMQ(rabbit, channel);

    await Promise.all(_.map(routes, async (route) => {
      const resource = _.get(Resources, route.resource);

      if (!resource) {
        logger(`${route.resource} not found`);
        throw new Error('Resource not found');
      }

      await Adapter.RabbitMQ.subscribe(route.api, resource);
    }));
  } catch (err) { logger(err); throw err; }
};

adapter.stop = async () => { Adapter.RabbitMQ.close(); };

export default adapter;
