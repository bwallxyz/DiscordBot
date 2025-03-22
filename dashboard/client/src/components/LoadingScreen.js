import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { Discord } from './Icons';

const LoadingScreen = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <Discord sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
      <CircularProgress size={40} sx={{ mb: 2 }} />
      <Typography variant="h6" color="text.secondary">
        Loading Dashboard...
      </Typography>
    </Box>
  );
};

export default LoadingScreen;