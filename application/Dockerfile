# Use an official Python runtime as a parent image
FROM python:3.9-slim-buster

# Set the working directory to /app
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install needed packages specified in requirements.txt
RUN pip install --trusted-host pypi.python.org -r requirements.txt

# Make port 8000 available to the outside this container
EXPOSE 8000

# Run manage.py when the container launches
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# Set the exeuction permission for the .sh scripts
RUN chmod +x /app/test.sh

# Run .sh script to test the application
ENV REQUIRED_SETTING=some-value
RUN /app/test.sh
