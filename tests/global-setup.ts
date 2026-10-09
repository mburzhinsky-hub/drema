// Все расчёты привязаны к местному времени, поэтому тесты идут в одном часовом поясе.
export default function setup(): void {
  process.env.TZ = 'Europe/Moscow';
}
