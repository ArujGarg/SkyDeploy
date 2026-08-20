/api

-Add retry mechanism in worker if processing fails after brpop from redis queue (BullMQ maybe)\
-put deployment-queue key into a common file to be imported at multiple places\
-health checkups\
-stream deployment logs\

//when a user is deleted, all its dpeloyments should also be deleted. but for that we want to stop and delete all the containers and stuff which were running for that user.

//fix the prisma.account fetching access token logic being used a multiple places. maybe put it in a function and use it whererver needed

//for public dpeloyments ,only allow public repos and dont try to deploy the private repos

//what to do when the deployment fails because the github access token has expired.
