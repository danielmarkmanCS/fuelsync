import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import nutritionRouter from './routes/nutrition';

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? '*' }));
app.use(express.json());

app.use('/api/nutrition', nutritionRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`FuelSync server running on port ${PORT}`);
});

export default app;
