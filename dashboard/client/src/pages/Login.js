import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Box, Typography, Button, Paper } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { Discord as DiscordIcon } from '../components/Icons';

const Login = () => {
  const { login, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      if (isAdmin) {
        navigate('/');
      } else {
        navigate('/unauthorized');
      }
    }
  }, [isAuthenticated, isAdmin, navigate]);

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            borderRadius: 2,
            bgcolor: 'background.paper',
          }}
        >
          <Typography variant="h4" component="h1" gutterBottom>
            Discord Room Bot Dashboard
          </Typography>
          
          <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
            Log in with your Discord account to access the admin dashboard.
            Only server administrators can access this dashboard.
          </Typography>
          
          <Button
            variant="contained"
            size="large"
            onClick={login}
            startIcon={<DiscordIcon />}
            sx={{
              bgcolor: '#5865F2',
              '&:hover': {
                bgcolor: '#4752C4',
              },
              borderRadius: 2,
              py: 1.5,
              px: 3,
            }}
          >
            Login with Discord
          </Button>
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;