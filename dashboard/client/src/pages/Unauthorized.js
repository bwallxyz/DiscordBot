import React from 'react';
import { Container, Box, Typography, Button, Paper } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Unauthorized = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
          <Typography variant="h4" component="h1" gutterBottom sx={{ color: 'error.main' }}>
            Access Denied
          </Typography>
          
          <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
            {user ? (
              <>
                Sorry, <strong>{user.username}</strong>. You don't have administrator 
                permissions for this server. Only server administrators can access this dashboard.
              </>
            ) : (
              <>
                You don't have administrator permissions for this server.
                Only server administrators can access this dashboard.
              </>
            )}
          </Typography>
          
          <Button
            variant="contained"
            color="primary"
            onClick={handleLogout}
            sx={{ borderRadius: 2 }}
          >
            Return to Login
          </Button>
        </Paper>
      </Box>
    </Container>
  );
};

export default Unauthorized;