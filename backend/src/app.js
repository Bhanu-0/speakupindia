 const start = async () => {
  try {
    // Start server first so health check works immediately
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`SpeakUpIndia API running on port ${PORT}`);
    });

    // Then connect to MongoDB
    if (!process.env.MONGO_URI) {
      console.warn('Warning: MONGO_URI not set');
      return;
    }

    await mongoose.connect(process.env.MONGO_URI, {
      dbName: 'speakupindia',
    });
    console.log('MongoDB connected');

    // Redis optional
    try {
      await initRedis();
      console.log('Redis connected');
    } catch (redisErr) {
      console.warn('Redis not available — continuing without it');
    }

  } catch (err) {
    console.error('Failed to start:', err.message);
  }
};