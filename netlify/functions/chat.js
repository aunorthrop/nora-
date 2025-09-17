exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod === 'GET') {
    // Return WebSocket connection info for Realtime API
    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'OpenAI API key not configured' })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        websocketUrl: 'wss://api.openai.com/v1/realtime',
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-realtime-preview-2024-10-01'
      })
    };
  }

  // Keep the existing POST handler for fallback text-based chat
  if (event.httpMethod === 'POST') {
    try {
      const { messages, max_tokens, temperature, presence_penalty, frequency_penalty } = JSON.parse(event.body);
      
      if (!messages || !Array.isArray(messages)) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ error: 'Messages array is required' })
        };
      }

      if (!process.env.OPENAI_API_KEY) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ error: 'OpenAI API key not configured' })
        };
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: max_tokens || 150,
          temperature: temperature || 0.7,
          presence_penalty: presence_penalty || 0.3,
          frequency_penalty: frequency_penalty || 0.3
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('OpenAI API Error:', error);
        
        let errorMessage = 'Failed to get response from AI';
        if (error.error?.code === 'insufficient_quota') {
          errorMessage = 'API quota exceeded. Please try again later.';
        } else if (error.error?.code === 'invalid_api_key') {
          errorMessage = 'API configuration error. Please contact support.';
        } else if (error.error?.message) {
          errorMessage = error.error.message;
        }
        
        return {
          statusCode: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ error: errorMessage })
        };
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ error: 'Invalid response from AI service' })
        };
      }
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          response: data.choices[0].message.content.trim()
        })
      };

    } catch (error) {
      console.error('Function Error:', error);
      
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Internal server error. Please try again.'
        })
      };
    }
  }

  return {
    statusCode: 405,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};
