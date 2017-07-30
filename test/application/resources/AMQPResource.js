import delay from '../delay';

export const AMQPResource = {
  async create(ctx) {
    const time = 100 * Math.random();
    await delay(time);
    ctx.body = { message: 'success' };
  },
  async update(ctx) {
    const time = 100 * Math.random();
    await delay(time);
    ctx.body = { message: 'success' };
  },
  async retrieve(ctx) {
    const time = 100 * Math.random();
    await delay(time);
    ctx.body = { message: 'success' };
  },
  async remove(ctx) {
    const time = 100 * Math.random();
    await delay(time);
    ctx.body = { message: 'success' };
  },
};
