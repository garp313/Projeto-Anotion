import os, zipfile

project_root = os.getcwd()
# Output zip one level up from project root
output_path = os.path.abspath(os.path.join(project_root, '..', 'Projeto-Anotion-src.zip'))

ignore_dirs = {'.git', 'node_modules', '.next'}

with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for foldername, subfolders, filenames in os.walk(project_root):
        # modify subfolders in-place to skip ignored directories
        subfolders[:] = [d for d in subfolders if d not in ignore_dirs]
        for filename in filenames:
            file_path = os.path.join(foldername, filename)
            # Compute archive name relative to project root
            arcname = os.path.relpath(file_path, project_root)
            zipf.write(file_path, arcname)
print('Created zip at', output_path)
