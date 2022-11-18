import axios, { AxiosResponse } from 'axios';
import dotenv from 'dotenv';

export function getFirebaseFunctionUrl() {
  const timezone = 'us-central1';
  const isProd = process.env.NODE_ENV === 'production';
  const projectId = process.env.FIREBASE_PROJECT_ID

  return isProd
    ? `https://${timezone}-${projectId}.cloudfunctions.net`
    : `http://localhost:5001/${projectId}/${timezone}`;
}

export interface TweetSignalData {
  data: {
    id: string;
    author_id: string;
    text: string;
  };
  matching_rules: { id: string }[];
}

dotenv.config();

function getToken() {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    throw new Error('TWITTER_BEARER_TOKEN is missing');
  }
  return token;
}

(async () => {
  await streamTweets();
})();

async function streamTweets() {
  console.log('Connecting to Twitter tweets stream...');

  const token = getToken();
  const url = `https://api.twitter.com/2/tweets/search/stream`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'stream',
  });

  handleResponseStatus(response);

  const stream = response.data;

  stream
    .on('data', onData)
    .on('close', onClose)
    .on('error', onError)
    .on('timeout', onTimeout);

  return stream;
}

function parseTweet(raw: Buffer): TweetSignalData | null {
  try {
    const str = raw
      .toString()
      .replace(/[\n\t\r]/g, '')
      .trim();
    if (!str || str === '') {
      return null;
    }
    return JSON.parse(str);
  } catch (error) {
    console.error('Cannot parse JSON: ', error);
    return null;
  }
}

async function onData(rawData: Buffer) {
  try {
    const tweet = parseTweet(rawData);

    if (tweet) {
      console.log(tweet);

      await axios.post(`${getFirebaseFunctionUrl()}/signal`, {
        triggerId: 'when-someone-tweets',
        data: tweet,
      });
    }
  } catch (error) {
    // TODO: Handle error
    console.error('error: ', error);
  }
}

function onClose() {
  console.log('Connection to Twitter tweets stream closed');
  streamTweets();
}

function onError(...errors: any[]) {
  console.error('Error: ', errors);
  streamTweets();
}

function onTimeout(...errors: any[]) {
  console.error('Timeout: ', errors);
  streamTweets();
}

function handleResponseStatus(response: AxiosResponse) {
  switch (response.status) {
    case 429:
      // TODO: Reconnect instead of throwing error
      throw new Error('TooManyConnections');

    case 200:
    case 201:
      break;

    default:
      throw new Error('Could not stream Twitter tweets');
  }
}
