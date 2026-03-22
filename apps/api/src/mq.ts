import amqp from 'amqplib';
import { env } from './env.js';

let connectionPromise: Promise<any> | null = null;

export function getRabbitConnection() {
  if (!connectionPromise) {
    connectionPromise = amqp.connect(env.RABBITMQ_URL);
  }

  return connectionPromise;
}

export async function createChannel() {
  const connection = await getRabbitConnection();
  return connection.createChannel();
}
