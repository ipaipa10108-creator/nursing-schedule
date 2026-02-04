import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const scriptPath = path.join(process.cwd(), 'solver', 'schedule_optimizer.py');
        const solverDir = path.join(process.cwd(), 'solver');

        // We strive to use 'uv', but we need to ensure it's available.
        // In this local dev environment, we assume 'uv' is in the PATH or we can find it.
        // If 'uv' fails to spawn, we might fallback or error out.
        // Command: uv run schedule_optimizer.py (executed in solver dir)

        console.log('Running optimization with script:', scriptPath);

        return new Promise<NextResponse>((resolve) => {
            const pythonProcess = spawn('uv', ['run', 'schedule_optimizer.py'], {
                cwd: solverDir,
                env: process.env, // Inherit environment variables
            });

            let outputData = '';
            let errorData = '';

            // Send data to stdin
            pythonProcess.stdin.write(JSON.stringify(body));
            pythonProcess.stdin.end();

            pythonProcess.stdout.on('data', (data) => {
                outputData += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorData += data.toString();
                // Log stderr but don't fail immediately, sometimes tools output to stderr
                console.error('Solver stderr:', data.toString());
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error(`Solver exited with code ${code}`);
                    resolve(NextResponse.json(
                        { success: false, error: `Solver failed with code ${code}: ${errorData}` },
                        { status: 500 }
                    ));
                    return;
                }

                try {
                    // Parse the JSON output from the script
                    const result = JSON.parse(outputData);
                    resolve(NextResponse.json(result));
                } catch (e) {
                    console.error('Failed to parse solver output:', outputData);
                    resolve(NextResponse.json(
                        { success: false, error: 'Invalid response from solver', details: outputData },
                        { status: 500 }
                    ));
                }
            });

            pythonProcess.on('error', (err) => {
                console.error('Failed to start solver process:', err);
                resolve(NextResponse.json(
                    { success: false, error: 'Failed to start solver process (uv might not be installed)', details: err.message },
                    { status: 500 }
                ));
            });
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
