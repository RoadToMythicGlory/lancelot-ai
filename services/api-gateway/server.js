const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const cors = require('cors');
const http = require('http');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Import your GraphQL schema and resolvers
const { typeDefs } = require('./dist/schema');
const { resolvers } = require('./dist/resolvers');
const { connectMongoDB, connectMongoose } = require('./dist/config/mongodb');

async function startServer() {
  const app = express();
  
  // Configure CORS
  app.use(cors({
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    credentials: true
  }));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  try {
    // Connect to MongoDB
    await connectMongoose();
    await connectMongoDB();
    console.log('✅ Connected to MongoDB');

    // Create Apollo Server
    const server = new ApolloServer({
      typeDefs,
      resolvers,
      context: ({ req }) => {
        // Add your context logic here (auth, etc.)
        return {
          req,
          // Add other context properties as needed
        };
      },
      introspection: process.env.NODE_ENV !== 'production',
      playground: process.env.NODE_ENV !== 'production'
    });

    await server.start();
    server.applyMiddleware({ app, path: '/graphql' });

    const httpServer = http.createServer(app);
    
    const PORT = process.env.PORT || 4000;
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server ready at http://localhost:${PORT}${server.graphqlPath}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();



















































