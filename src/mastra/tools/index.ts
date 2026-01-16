import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

interface GeocodingResponse {
  results: {
    latitude: number;
    longitude: number;
    name: string;
  }[];
}
interface WeatherResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    weather_code: number;
  };
}

export const weatherTool = createTool({
  id: 'get-weather',
  description: 'Get current weather for a location',
  inputSchema: z.object({
    location: z.string().describe('City name'),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    feelsLike: z.number(),
    humidity: z.number(),
    windSpeed: z.number(),
    windGust: z.number(),
    conditions: z.string(),
    location: z.string(),
  }),
  execute: async ({ context }) => {
    return await getWeather(context.location);
  },
});

export const weatherToolByDate = createTool({
  id: 'get-weather-by-date',
  description: 'Get weather for a location on a specific date (supports past and future dates)',
  inputSchema: z.object({
    location: z.string().describe('City name'),
    date: z.string().describe('Date in YYYY-MM-DD format (e.g., 2024-01-15)'),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    feelsLike: z.number(),
    humidity: z.number(),
    windSpeed: z.number(),
    windGust: z.number(),
    conditions: z.string(),
    location: z.string(),
    date: z.string(),
  }),
  execute: async ({ context }) => {
    return await getWeatherByDate(context.location, context.date);
  },
});

const getWeather = async (location: string) => {
  const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
  const geocodingResponse = await fetch(geocodingUrl);
  const geocodingData = (await geocodingResponse.json()) as GeocodingResponse;

  if (!geocodingData.results?.[0]) {
    throw new Error(`Location '${location}' not found`);
  }

  const { latitude, longitude, name } = geocodingData.results[0];

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code`;

  const response = await fetch(weatherUrl);
  const data = (await response.json()) as WeatherResponse;

  return {
    temperature: data.current.temperature_2m,
    feelsLike: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    windSpeed: data.current.wind_speed_10m,
    windGust: data.current.wind_gusts_10m,
    conditions: getWeatherCondition(data.current.weather_code),
    location: name,
  };
};

const getWeatherByDate = async (location: string, dateStr: string) => {
  const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
  const geocodingResponse = await fetch(geocodingUrl);
  const geocodingData = (await geocodingResponse.json()) as GeocodingResponse;

  if (!geocodingData.results?.[0]) {
    throw new Error(`Location '${location}' not found`);
  }

  const { latitude, longitude, name } = geocodingData.results[0];

  const targetDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  const isFuture = targetDate > today;
  const isPast = targetDate < today;

  let weatherUrl: string;

  if (isPast) {
    weatherUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code`;
  } else if (isFuture) {
    weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,relative_humidity_2m_mean,wind_speed_10m_max,wind_gusts_10m_max,weather_code&timezone=auto`;
  } else {
    weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code`;
  }

  const response = await fetch(weatherUrl);
  const data = await response.json();

  if (isPast) {
    const hourlyData = (data as any).hourly;
    if (!hourlyData || hourlyData.temperature_2m.length === 0) {
      throw new Error(`No weather data available for ${dateStr}`);
    }
    const noonIndex = Math.floor(hourlyData.temperature_2m.length / 2);
    return {
      temperature: hourlyData.temperature_2m[noonIndex],
      feelsLike: hourlyData.apparent_temperature[noonIndex],
      humidity: hourlyData.relative_humidity_2m[noonIndex],
      windSpeed: hourlyData.wind_speed_10m[noonIndex],
      windGust: hourlyData.wind_gusts_10m[noonIndex],
      conditions: getWeatherCondition(hourlyData.weather_code[noonIndex]),
      location: name,
      date: dateStr,
    };
  } else if (isFuture) {
    const dailyData = (data as any).daily;
    if (!dailyData || dailyData.time.length === 0) {
      throw new Error(`No forecast data available for ${dateStr}`);
    }
    const targetDateStr = dateStr;
    const dateIndex = dailyData.time.findIndex((t: string) => t.startsWith(targetDateStr));
    if (dateIndex === -1) {
      throw new Error(`Forecast not available for ${dateStr}`);
    }
    return {
      temperature: (dailyData.temperature_2m_max[dateIndex] + dailyData.temperature_2m_min[dateIndex]) / 2,
      feelsLike: (dailyData.apparent_temperature_max[dateIndex] + dailyData.apparent_temperature_min[dateIndex]) / 2,
      humidity: dailyData.relative_humidity_2m_mean[dateIndex],
      windSpeed: dailyData.wind_speed_10m_max[dateIndex],
      windGust: dailyData.wind_gusts_10m_max[dateIndex],
      conditions: getWeatherCondition(dailyData.weather_code[dateIndex]),
      location: name,
      date: dateStr,
    };
  } else {
    const currentData = (data as WeatherResponse).current;
    return {
      temperature: currentData.temperature_2m,
      feelsLike: currentData.apparent_temperature,
      humidity: currentData.relative_humidity_2m,
      windSpeed: currentData.wind_speed_10m,
      windGust: currentData.wind_gusts_10m,
      conditions: getWeatherCondition(currentData.weather_code),
      location: name,
      date: dateStr,
    };
  }
};

function getWeatherCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return conditions[code] || 'Unknown';
}
