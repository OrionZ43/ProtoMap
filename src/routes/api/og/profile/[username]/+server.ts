// src/routes/api/og/profile/[username]/+server.tsx <--- ВАЖНО: расширение .tsx
import { ImageResponse } from '@vercel/og';
import { firestoreAdmin } from '$lib/server/firebase.admin';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, fetch }) => {
    try {
        const { username } = params;

        // 1. Получаем данные пользователя
        const usersRef = firestoreAdmin.collection('users');
        const userSnapshot = await usersRef.where('username', '==', username).limit(1).get();

        if (userSnapshot.empty) {
            return new ImageResponse(
                (
                    <div
                        style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#0a0a0f',
                        }}
                    >
                        <div style={{ color: '#fcee0a', fontSize: 60, fontWeight: 'bold' }}>
                            User Not Found
                        </div>
                    </div>
                ),
                { width: 1200, height: 630 }
            );
        }

        const userData = userSnapshot.docs[0].data();
        const avatarUrl = userData.avatar_url || '';
        const status = userData.status || 'Нет статуса';

        // 2. Загружаем аватар
        let avatarBase64 = '';
        if (avatarUrl && avatarUrl.startsWith('http')) {
            try {
                const avatarResponse = await fetch(avatarUrl);
                const buffer = await avatarResponse.arrayBuffer();
                // Конвертируем в base64 для надежного отображения
                const base64String = Buffer.from(buffer).toString('base64');
                const contentType = avatarResponse.headers.get('content-type') || 'image/jpeg';
                avatarBase64 = `data:${contentType};base64,${base64String}`;
            } catch (e) {
                console.error('Failed to fetch avatar:', e);
            }
        }

        // 3. Генерация изображения
        return new ImageResponse(
            (
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)',
                        position: 'relative',
                    }}
                >
                    {/* Декоративная сетка */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            display: 'flex',
                            backgroundImage: 'linear-gradient(rgba(252, 238, 10, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(252, 238, 10, 0.05) 1px, transparent 1px)',
                            backgroundSize: '50px 50px',
                            opacity: 0.3,
                        }}
                    />

                    {/* Углы */}
                    <div style={{ position: 'absolute', top: 20, left: 20, width: 60, height: 60, borderLeft: '3px solid #fcee0a', borderTop: '3px solid #fcee0a' }} />
                    <div style={{ position: 'absolute', top: 20, right: 20, width: 60, height: 60, borderRight: '3px solid #ff003c', borderTop: '3px solid #ff003c' }} />

                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: 1,
                            zIndex: 10,
                        }}
                    >
                        {/* Аватар */}
                        {avatarBase64 ? (
                            <img
                                src={avatarBase64}
                                alt="avatar"
                                style={{
                                    width: 280,
                                    height: 280,
                                    borderRadius: 140, // Намного надежнее в Satori чем 50%
                                    border: '6px solid #fcee0a',
                                    objectFit: 'cover',
                                    marginBottom: 40,
                                }}
                            />
                        ) : (
                             <div style={{ width: 280, height: 280, borderRadius: 140, background: '#333', marginBottom: 40 }} />
                        )}

                        <div
                            style={{
                                fontSize: 72,
                                fontWeight: 900,
                                color: '#ffffff',
                                marginBottom: 20,
                            }}
                        >
                            {username}
                        </div>

                        <div
                            style={{
                                fontSize: 32,
                                color: '#fcee0a',
                                textAlign: 'center',
                                maxWidth: '80%',
                            }}
                        >
                            {status.slice(0, 80)}
                        </div>
                    </div>

                    {/* Футер */}
                    <div
                        style={{
                            position: 'absolute',
                            bottom: 0,
                            width: '100%',
                            height: 80,
                            background: 'rgba(0,0,0,0.3)',
                            borderTop: '2px solid rgba(252, 238, 10, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <div style={{ fontSize: 24, color: '#00f0ff', letterSpacing: 5 }}>
                            PROTOMAP // ONLINE
                        </div>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            }
        );
    } catch (error: any) {
        console.error('OG Error:', error);
        return new Response(`Failed to generate image: ${error.message}`, { status: 500 });
    }
};