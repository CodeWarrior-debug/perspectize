import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.perspectize.app',
	appName: 'Perspectize',
	webDir: 'build',
	server: {
		androidScheme: 'https',
	},
};

export default config;
